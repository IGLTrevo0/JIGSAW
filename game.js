/* ═══════════════════════════════════════════════
   Phoenix Jigsaw Puzzle — game.js
   No frameworks, no libraries, pure vanilla JS.
   ═══════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── DOM refs ──
    const boardEl      = document.getElementById('board');
    const trayPiecesEl = document.getElementById('tray-pieces');
    const winMsgEl     = document.getElementById('win-msg');
    const playAgainBtn = document.getElementById('play-again');

    // ── State ──
    let tileSize     = 0;           // px — calculated from board width
    let trayPieces   = [];          // array of pieceValues currently in tray
    let placedPieces = {};          // { dropZoneIndex: pieceValue }
    let dragSource   = null;        // { from: 'tray'|'board', val: Number, dzIndex?: Number }

    // ── Constants ──
    const GRID = 7;
    const TOTAL = GRID * GRID;      // 49
    const TRAY_PIECE_SIZE = 80;     // px
    const TRAY_BG_FULL   = 560;    // 80 / tileSize * tileSize * 7 simplifies to 560 always

    // ──────────────────────────────────────────────
    //  Fisher-Yates Shuffle (unbiased)
    // ──────────────────────────────────────────────
    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ──────────────────────────────────────────────
    //  Board initialisation — 49 invisible drop zones
    // ──────────────────────────────────────────────
    function initBoard() {
        boardEl.innerHTML = '';
        tileSize = boardEl.offsetWidth / GRID;

        for (let idx = 0; idx < TOTAL; idx++) {
            const row = Math.floor(idx / GRID);
            const col = idx % GRID;

            const dz = document.createElement('div');
            dz.className = 'drop-zone';
            dz.dataset.index   = idx;
            dz.dataset.correct = idx;   // correct pieceValue for this cell
            dz.style.left   = (col * tileSize) + 'px';
            dz.style.top    = (row * tileSize) + 'px';
            dz.style.width  = tileSize + 'px';
            dz.style.height = tileSize + 'px';

            // dragover — allow drop + highlight
            dz.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this.classList.add('drag-over');
            });

            dz.addEventListener('dragleave', function () {
                this.classList.remove('drag-over');
            });

            // drop handler
            dz.addEventListener('drop', function (e) {
                e.preventDefault();
                this.classList.remove('drag-over');

                const pieceVal = parseInt(e.dataTransfer.getData('pieceValue'), 10);
                const fromType = e.dataTransfer.getData('fromType');
                const fromDz   = e.dataTransfer.getData('fromDzIndex');

                if (isNaN(pieceVal)) return;

                handleDrop(idx, pieceVal, fromType, fromDz !== '' ? parseInt(fromDz, 10) : null);
            });

            boardEl.appendChild(dz);
        }
    }

    // ──────────────────────────────────────────────
    //  Tray initialisation
    // ──────────────────────────────────────────────
    function initTray() {
        trayPieces = [];
        for (let i = 0; i < TOTAL; i++) trayPieces.push(i);
        shuffleArray(trayPieces);
        renderTray();
    }

    // ──────────────────────────────────────────────
    //  Render entire tray from trayPieces[]
    // ──────────────────────────────────────────────
    function renderTray() {
        trayPiecesEl.innerHTML = '';
        trayPieces.forEach(function (val) {
            trayPiecesEl.appendChild(renderTrayPiece(val));
        });
    }

    // ──────────────────────────────────────────────
    //  Create a single tray piece element
    // ──────────────────────────────────────────────
    function renderTrayPiece(val) {
        const col = val % GRID;
        const row = Math.floor(val / GRID);

        const div = document.createElement('div');
        div.className   = 'tray-piece';
        div.draggable   = true;
        div.dataset.val = val;

        // background-size is always 800px for 80px tray pieces
        div.style.backgroundSize     = TRAY_BG_FULL + 'px ' + TRAY_BG_FULL + 'px';
        div.style.backgroundPosition = -(col * TRAY_PIECE_SIZE) + 'px ' + -(row * TRAY_PIECE_SIZE) + 'px';

        div.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('pieceValue', val);
            e.dataTransfer.setData('fromType', 'tray');
            e.dataTransfer.setData('fromDzIndex', '');
            e.dataTransfer.effectAllowed = 'move';
            this.classList.add('dragging');

            dragSource = { from: 'tray', val: val };
        });

        div.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            dragSource = null;
        });

        return div;
    }

    // ──────────────────────────────────────────────
    //  Create a board piece element (placed in drop zone)
    // ──────────────────────────────────────────────
    function renderBoardPiece(val) {
        const col = val % GRID;
        const row = Math.floor(val / GRID);
        const fullSize = tileSize * GRID;

        const div = document.createElement('div');
        div.className   = 'board-piece';
        div.draggable   = true;
        div.dataset.val = val;

        div.style.backgroundSize     = fullSize + 'px ' + fullSize + 'px';
        div.style.backgroundPosition = -(col * tileSize) + 'px ' + -(row * tileSize) + 'px';

        // board pieces are also draggable (move between drop zones)
        div.addEventListener('dragstart', function (e) {
            const parentDz = this.parentElement;
            const dzIdx = parseInt(parentDz.dataset.index, 10);

            e.dataTransfer.setData('pieceValue', val);
            e.dataTransfer.setData('fromType', 'board');
            e.dataTransfer.setData('fromDzIndex', dzIdx);
            e.dataTransfer.effectAllowed = 'move';
            this.classList.add('dragging');

            dragSource = { from: 'board', val: val, dzIndex: dzIdx };
        });

        div.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            dragSource = null;
        });

        return div;
    }

    // ──────────────────────────────────────────────
    //  Handle a piece being dropped onto a drop zone
    // ──────────────────────────────────────────────
    function handleDrop(dropZoneIndex, pieceVal, fromType, fromDzIndex) {
        const dropZones = boardEl.querySelectorAll('.drop-zone');
        const targetDz  = dropZones[dropZoneIndex];

        // ── If target drop zone already has a piece, return it to tray ──
        if (placedPieces.hasOwnProperty(dropZoneIndex)) {
            const existingVal = placedPieces[dropZoneIndex];
            trayPieces.push(existingVal);
            delete placedPieces[dropZoneIndex];
            // clear the existing piece element
            const existingPieceEl = targetDz.querySelector('.board-piece');
            if (existingPieceEl) existingPieceEl.remove();
        }

        // ── Remove piece from its source ──
        if (fromType === 'tray') {
            // Remove from trayPieces array
            const trayIdx = trayPieces.indexOf(pieceVal);
            if (trayIdx !== -1) trayPieces.splice(trayIdx, 1);
        } else if (fromType === 'board' && fromDzIndex !== null) {
            // Remove from old drop zone
            delete placedPieces[fromDzIndex];
            const oldDz = dropZones[fromDzIndex];
            const oldPieceEl = oldDz.querySelector('.board-piece');
            if (oldPieceEl) oldPieceEl.remove();
        }

        // ── Place the piece in the target drop zone ──
        placedPieces[dropZoneIndex] = pieceVal;
        targetDz.appendChild(renderBoardPiece(pieceVal));

        // ── Re-render tray (may have gained or lost pieces) ──
        renderTray();

        // ── Check win ──
        checkWin();
    }

    // ──────────────────────────────────────────────
    //  Win detection
    // ──────────────────────────────────────────────
    function checkWin() {
        if (Object.keys(placedPieces).length < TOTAL) return;

        const dropZones = boardEl.querySelectorAll('.drop-zone');

        for (let i = 0; i < TOTAL; i++) {
            const correctVal = parseInt(dropZones[i].dataset.correct, 10);
            if (placedPieces[i] !== correctVal) return;
        }

        // All 49 match!
        winMsgEl.classList.remove('hidden');
    }

    // ──────────────────────────────────────────────
    //  Reset / Play Again
    // ──────────────────────────────────────────────
    function resetGame() {
        placedPieces = {};
        winMsgEl.classList.add('hidden');
        initBoard();
        initTray();
    }

    // ──────────────────────────────────────────────
    //  Handle window resize — recalculate board
    // ──────────────────────────────────────────────
    function handleResize() {
        // Save current state
        const savedPlaced = Object.assign({}, placedPieces);
        const savedTray   = trayPieces.slice();

        // Recalculate tileSize and re-render board
        tileSize = boardEl.offsetWidth / GRID;
        boardEl.innerHTML = '';
        initBoard();

        // Re-place saved board pieces
        const dropZones = boardEl.querySelectorAll('.drop-zone');
        for (const dzIdx in savedPlaced) {
            const val = savedPlaced[dzIdx];
            placedPieces[dzIdx] = val;
            dropZones[dzIdx].appendChild(renderBoardPiece(val));
        }

        // Restore tray
        trayPieces = savedTray;
        renderTray();
    }

    // ──────────────────────────────────────────────
    //  Boot
    // ──────────────────────────────────────────────
    playAgainBtn.addEventListener('click', resetGame);
    window.addEventListener('resize', handleResize);

    // Start the game
    initBoard();
    initTray();

})();

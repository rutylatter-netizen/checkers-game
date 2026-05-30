(() => {
  'use strict';

  // ===== קבועים =====
  const BOARD_SIZE = 8;
  const BLACK = 'black';
  const ORANGE = 'orange';

  // ===== מצב משחק =====
  const state = {
    board: [],            // 8x8: null | { color, king }
    currentPlayer: BLACK, // שחור מתחיל
    selected: null,       // { row, col }
    validMoves: [],       // [{ row, col, captures: [{row,col}] }]
    mustCapturePieces: [],// כלים שחייבים לאכול בתור הזה
    multiJumpPiece: null, // אם בתוך רצף אכילה
    players: { black: 'שחקן 1', orange: 'שחקן 2' },
    gameOver: false,
  };

  // ===== אלמנטים =====
  const $ = (id) => document.getElementById(id);
  const loginScreen = $('login-screen');
  const gameScreen = $('game-screen');
  const boardEl = $('board');
  const winModal = $('win-modal');

  // ===== כניסה =====
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const u1 = $('user1').value.trim();
    const p1 = $('pass1').value;
    const u2 = $('user2').value.trim();
    const p2 = $('pass2').value;
    const err = $('login-error');

    if (u1.length < 2 || u2.length < 2) {
      return showError('שם משתמש חייב להיות לפחות 2 תווים');
    }
    if (p1.length < 4 || p2.length < 4) {
      return showError('סיסמא חייבת להיות לפחות 4 תווים');
    }
    if (u1.toLowerCase() === u2.toLowerCase()) {
      return showError('שני השחקנים חייבים שמות שונים');
    }

    err.hidden = true;
    state.players.black = u1;
    state.players.orange = u2;
    $('player1-name').textContent = u1;
    $('player2-name').textContent = u2;

    loginScreen.classList.remove('active');
    gameScreen.classList.add('active');
    newGame();

    function showError(msg) {
      err.textContent = msg;
      err.hidden = false;
    }
  });

  $('new-game-btn').addEventListener('click', newGame);
  $('win-new-game').addEventListener('click', () => {
    winModal.hidden = true;
    newGame();
  });
  $('logout-btn').addEventListener('click', () => {
    gameScreen.classList.remove('active');
    loginScreen.classList.add('active');
    $('login-form').reset();
  });

  // ===== אתחול משחק =====
  function newGame() {
    state.board = createInitialBoard();
    state.currentPlayer = BLACK;
    state.selected = null;
    state.validMoves = [];
    state.multiJumpPiece = null;
    state.gameOver = false;
    winModal.hidden = true;
    updateMustCapturePieces();
    render();
  }

  function createInitialBoard() {
    const b = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!isDarkSquare(row, col)) continue;
        if (row < 3) b[row][col] = { color: BLACK, king: false };
        else if (row > 4) b[row][col] = { color: ORANGE, king: false };
      }
    }
    return b;
  }

  const isDarkSquare = (r, c) => (r + c) % 2 === 1;
  const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  const opponent = (color) => color === BLACK ? ORANGE : BLACK;

  // ===== חישוב מהלכים =====
  // מחזיר את כל המהלכים החוקיים עבור הכלי הנתון
  function getMovesForPiece(row, col) {
    const piece = state.board[row][col];
    if (!piece) return { moves: [], captures: [] };

    const directions = getDirections(piece);
    const moves = [];
    const captures = [];

    for (const [dr, dc] of directions) {
      // הליכה רגילה (רק אם אין אכילה אפשרית - נסונן בהמשך)
      const nr = row + dr;
      const nc = col + dc;
      if (inBounds(nr, nc) && isDarkSquare(nr, nc) && state.board[nr][nc] === null) {
        moves.push({ row: nr, col: nc, captures: [] });
      }
    }

    // אכילות (יכולות להיות רב-קפיצה)
    const captureSequences = findCaptures(row, col, piece, [], state.board);
    for (const seq of captureSequences) {
      const last = seq[seq.length - 1];
      captures.push({
        row: last.row,
        col: last.col,
        captures: seq.map(s => ({ row: s.captured.row, col: s.captured.col })),
        path: seq,
      });
    }

    return { moves, captures };
  }

  function getDirections(piece) {
    if (piece.king) {
      return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    }
    // שחור נע למטה (row גדל), כתום נע למעלה (row קטן)
    return piece.color === BLACK
      ? [[1, -1], [1, 1]]
      : [[-1, -1], [-1, 1]];
  }

  // מציאת כל רצפי האכילה (DFS)
  function findCaptures(row, col, piece, path, board) {
    const sequences = [];
    const directions = getDirections(piece);
    let foundAny = false;

    for (const [dr, dc] of directions) {
      const midR = row + dr;
      const midC = col + dc;
      const landR = row + 2 * dr;
      const landC = col + 2 * dc;

      if (!inBounds(landR, landC)) continue;
      const midPiece = board[midR][midC];
      const landPiece = board[landR][landC];

      if (
        midPiece &&
        midPiece.color === opponent(piece.color) &&
        landPiece === null &&
        !path.some(p => p.captured.row === midR && p.captured.col === midC)
      ) {
        foundAny = true;
        const newStep = {
          from: { row, col },
          to: { row: landR, col: landC },
          captured: { row: midR, col: midC },
        };

        // סימולציה לרצף המשך
        const newBoard = cloneBoard(board);
        newBoard[row][col] = null;
        newBoard[midR][midC] = null;
        // הכתרה אמצע רצף עוצרת אכילה בדמקה ישראלית, אבל בכללים בינלאומיים ממשיך.
        // נאמץ את הכלל הפשוט: אם הופך למלך באמצע רצף - עוצר.
        let promotedMid = false;
        const willPromote = !piece.king && shouldPromote(landR, piece.color);
        const movedPiece = { color: piece.color, king: piece.king || willPromote };
        if (willPromote) promotedMid = true;
        newBoard[landR][landC] = movedPiece;

        const newPath = [...path, newStep];

        if (promotedMid) {
          sequences.push(newPath);
        } else {
          const deeper = findCaptures(landR, landC, movedPiece, newPath, newBoard);
          if (deeper.length === 0) {
            sequences.push(newPath);
          } else {
            sequences.push(...deeper);
          }
        }
      }
    }

    return sequences;
  }

  function cloneBoard(b) {
    return b.map(row => row.map(cell => cell ? { ...cell } : null));
  }

  function shouldPromote(row, color) {
    return (color === BLACK && row === BOARD_SIZE - 1) ||
           (color === ORANGE && row === 0);
  }

  // עדכון כלים שחייבים לאכול בתור הזה
  function updateMustCapturePieces() {
    state.mustCapturePieces = [];
    if (state.multiJumpPiece) {
      // בתוך רצף - רק הכלי הזה רלוונטי
      state.mustCapturePieces.push(state.multiJumpPiece);
      return;
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = state.board[r][c];
        if (p && p.color === state.currentPlayer) {
          const { captures } = getMovesForPiece(r, c);
          if (captures.length > 0) {
            state.mustCapturePieces.push({ row: r, col: c });
          }
        }
      }
    }
  }

  // ===== טיפול בלחיצות =====
  function handleSquareClick(row, col) {
    if (state.gameOver) return;
    const piece = state.board[row][col];

    // אם לחצנו על משבצת תקפה למעבר
    if (state.selected) {
      const target = state.validMoves.find(m => m.row === row && m.col === col);
      if (target) {
        executeMove(state.selected.row, state.selected.col, target);
        return;
      }
    }

    // בחירת כלי
    if (piece && piece.color === state.currentPlayer) {
      // אם יש כלים שחייבים לאכול, מותר לבחור רק מהם
      if (state.mustCapturePieces.length > 0) {
        const inList = state.mustCapturePieces.some(p => p.row === row && p.col === col);
        if (!inList) {
          showStatus('יש כלי שחייב לאכול - בחר את הכלי המהבהב');
          return;
        }
      }
      selectPiece(row, col);
    } else if (state.selected) {
      // ביטול בחירה
      state.selected = null;
      state.validMoves = [];
      render();
    }
  }

  function selectPiece(row, col) {
    const { moves, captures } = getMovesForPiece(row, col);
    state.selected = { row, col };
    // אם יש אכילות בכל מקום על הלוח, מציגים רק אכילות
    state.validMoves = state.mustCapturePieces.length > 0 ? captures : [...moves, ...captures];
    render();
  }

  function executeMove(fromR, fromC, target) {
    const piece = state.board[fromR][fromC];

    // הסרת אכולים
    for (const cap of target.captures) {
      state.board[cap.row][cap.col] = null;
    }

    // הזזה
    state.board[fromR][fromC] = null;
    state.board[target.row][target.col] = piece;

    // הכתרה
    if (!piece.king && shouldPromote(target.row, piece.color)) {
      piece.king = true;
    }

    // האם יש רצף המשך?
    if (target.captures.length > 0) {
      const { captures } = getMovesForPiece(target.row, target.col);
      // המשך רק אם כלי זה עדיין יכול לאכול והוא לא הוכתר עכשיו (אם הוכתר, הכלל שלנו עוצר)
      const justPromoted = !piece.king && shouldPromote(target.row, piece.color);
      // הערה: אנחנו כבר עדכנו piece.king, אז נבדוק לפי האם הוכתר ברגע הזה
      // נשתמש בדגל: אם המהלך הזה כולל הכתרה - אין המשך.
      if (captures.length > 0 && !justPromoted) {
        state.multiJumpPiece = { row: target.row, col: target.col };
        state.selected = { row: target.row, col: target.col };
        state.validMoves = captures;
        updateMustCapturePieces();
        showStatus('המשך לאכול עם אותו כלי!');
        render();
        return;
      }
    }

    // סיום תור
    state.multiJumpPiece = null;
    state.selected = null;
    state.validMoves = [];
    state.currentPlayer = opponent(state.currentPlayer);
    updateMustCapturePieces();

    if (checkWinCondition()) return;
    render();
  }

  // ===== בדיקת ניצחון =====
  function checkWinCondition() {
    const pieces = { black: 0, orange: 0 };
    let currentHasMoves = false;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = state.board[r][c];
        if (!p) continue;
        pieces[p.color]++;
        if (p.color === state.currentPlayer && !currentHasMoves) {
          const { moves, captures } = getMovesForPiece(r, c);
          if (moves.length > 0 || captures.length > 0) currentHasMoves = true;
        }
      }
    }

    let winner = null;
    if (pieces.black === 0) winner = ORANGE;
    else if (pieces.orange === 0) winner = BLACK;
    else if (!currentHasMoves) winner = opponent(state.currentPlayer);

    if (winner) {
      state.gameOver = true;
      showWinner(winner);
      return true;
    }
    return false;
  }

  function showWinner(winner) {
    const name = state.players[winner];
    const color = winner === BLACK ? 'שחור' : 'כתום';
    $('win-title').textContent = `🏆 ${name} ניצח!`;
    $('win-text').textContent = `שחקן ה${color} זכה במשחק. כל הכבוד!`;
    winModal.hidden = false;
    render();
  }

  // ===== רינדור =====
  function render() {
    boardEl.innerHTML = '';
    const mustSet = new Set(state.mustCapturePieces.map(p => `${p.row},${p.col}`));
    const moveSet = new Set(
      state.validMoves.map(m => `${m.row},${m.col}:${m.captures.length > 0 ? 'cap' : 'move'}`)
    );

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const sq = document.createElement('div');
        sq.className = `square ${isDarkSquare(r, c) ? 'dark' : 'light'}`;
        sq.dataset.row = r;
        sq.dataset.col = c;

        if (state.selected && state.selected.row === r && state.selected.col === c) {
          sq.classList.add('selected');
        }

        const moveCap = moveSet.has(`${r},${c}:cap`);
        const moveOnly = moveSet.has(`${r},${c}:move`);
        if (moveCap) sq.classList.add('valid-capture');
        else if (moveOnly) sq.classList.add('valid-move');

        const piece = state.board[r][c];
        if (piece) {
          const pe = document.createElement('div');
          pe.className = `piece ${piece.color}`;
          if (piece.king) pe.classList.add('king');
          if (mustSet.has(`${r},${c}`) && piece.color === state.currentPlayer) {
            pe.classList.add('must-capture');
          }
          sq.appendChild(pe);
        }

        sq.addEventListener('click', () => handleSquareClick(r, c));
        boardEl.appendChild(sq);
      }
    }

    updateHeader();
  }

  function updateHeader() {
    const pieces = { black: 0, orange: 0 };
    for (const row of state.board) {
      for (const p of row) if (p) pieces[p.color]++;
    }
    $('player1-pieces').textContent = pieces.black;
    $('player2-pieces').textContent = pieces.orange;
    $('current-player').textContent = state.players[state.currentPlayer];
    $('current-player').style.color = state.currentPlayer === ORANGE ? 'var(--orange)' : '#fff';

    $('player1-card').classList.toggle('active-turn', state.currentPlayer === BLACK);
    $('player2-card').classList.toggle('active-turn', state.currentPlayer === ORANGE);
  }

  let statusTimer = null;
  function showStatus(msg) {
    const el = $('status-message');
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; }, 2500);
  }
})();

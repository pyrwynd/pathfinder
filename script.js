const grid = document.getElementById('grid');
const toggle = document.getElementById('toggle');
const gridWidth = 30;
const gridHeight = 20;

let self = { x: 2, y: 2 };
let target2 = { x: gridWidth - 3, y: gridHeight - 3 };
let pathActive = false;
let obstacles = [];
let moveInterval = null;

const cells = [];
for (let y = 0;y < gridHeight;y++) {
  for (let x = 0;x < gridWidth;x++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.dataset.x = x;
    cell.dataset.y = y;
    grid.appendChild(cell);
    cells.push(cell);
  }
}

function createObstacles() {
  for (let i = 0;i < 100;i++) {
    const x = Math.floor(Math.random() * gridWidth);
    const y = Math.floor(Math.random() * gridHeight);
    if ((x === self.x && y === self.y) || (x === target2.x && y === target2.y)) continue;
    obstacles.push({ x, y });
    getCell(x, y).classList.add('obstacle');
  }
}
createObstacles();

function getCell(x, y) {
  return cells.find(cell => parseInt(cell.dataset.x) === x && parseInt(cell.dataset.y) === y);
}

function draw() {
  cells.forEach(cell => cell.classList.remove('player', 'target', 'path'));
  getCell(self.x, self.y).classList.add('player');
  getCell(target2.x, target2.y).classList.add('target');
}
draw();

const workerScript = `
  onmessage = function(event) {
    const { player, target, obstacles, gridWidth, gridHeight } = event.data;

    function calculateDistance(x1, y1, x2, y2) {
      return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    }

    function lineOfSight(x0, y0, x1, y1, obstacles, gridWidth) {
      let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      while (true) {
        if (x0 === x1 && y0 === y1) return true;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
        if (obstacles.some(obstacle => obstacle.x === x0 && obstacle.y === y0)) return false;
      }
    }

    function thetaStar(player, target, gridWidth, gridHeight, obstacles) {
      let openSet = [];
      let closedSet = new Set();
      openSet.push(player);

      const cameFrom = new Map();
      const gScore = new Map();
      const fScore = new Map();
      gScore.set(player.x + ',' + player.y, 0);
      fScore.set(player.x + ',' + player.y, calculateDistance(player.x, player.y, target.x, target.y));

      while (openSet.length > 0) {
        openSet.sort((a, b) => (fScore.get(a.x + ',' + a.y) || Infinity) - (fScore.get(b.x + ',' + b.y) || Infinity));
        let current = openSet.shift();

        if (current.x === target.x && current.y === target.y) {
          let path = [];
          while (cameFrom.has(current.x + ',' + current.y)) {
            path.push(current);
            current = cameFrom.get(current.x + ',' + current.y);
          }
          path.push(player);
          postMessage(path.reverse());
          return;
        }

        closedSet.add(current.x + ',' + current.y);
        const neighbors = [
          { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
          { x: current.x + 1, y: current.y + 1 }, { x: current.x - 1, y: current.y - 1 },
          { x: current.x + 1, y: current.y - 1 }, { x: current.x - 1, y: current.y + 1 }
        ];

        for (let neighbor of neighbors) {
          if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= gridWidth || neighbor.y >= gridHeight) continue;
          if (obstacles.some(obstacle => obstacle.x === neighbor.x && obstacle.y === neighbor.y)) continue;
          if (closedSet.has(neighbor.x + ',' + neighbor.y)) continue;

          let tentativeGScore = gScore.get(current.x + ',' + current.y) + (Math.abs(neighbor.x - current.x) === 1 && Math.abs(neighbor.y - current.y) === 1 ? 1.414 : 1);

          if (!gScore.has(neighbor.x + ',' + neighbor.y) || tentativeGScore < gScore.get(neighbor.x + ',' + neighbor.y)) {
            cameFrom.set(neighbor.x + ',' + neighbor.y, current);
            gScore.set(neighbor.x + ',' + neighbor.y, tentativeGScore);
            fScore.set(neighbor.x + ',' + neighbor.y, tentativeGScore + calculateDistance(neighbor.x, neighbor.y, target.x, target.y));
            if (lineOfSight(current.x, current.y, neighbor.x, neighbor.y, obstacles, gridWidth)) {
              openSet.push(neighbor);
            }
          }
        }
      }
      postMessage('No path found');
    }

    thetaStar(player, target, gridWidth, gridHeight, obstacles);
  }
`;

let pathWorker = new Worker(URL.createObjectURL(new Blob([workerScript])));
pathWorker.onmessage = function (event) {
  if (Array.isArray(event.data)) {
    event.data.forEach(point => {
      if (!(point.x === self.x && point.y === self.y) &&
          !(point.x === target2.x && point.y === target2.y)) {
        getCell(point.x, point.y).classList.add('path');
      }
    });
  } else {
    console.log(event.data);
  }
};

let pathInterval;
toggle.addEventListener('click', () => {
  pathActive = !pathActive;
  if (pathActive) {
    toggle.textContent = 'STOP';

    pathWorker.postMessage({
      player: self,
      target: target2,
      obstacles: obstacles,
      gridWidth: gridWidth,
      gridHeight: gridHeight
    });

    pathInterval = setInterval(() => {
      pathWorker.postMessage({
        player: self,
        target: target2,
        obstacles: obstacles,
        gridWidth: gridWidth,
        gridHeight: gridHeight
      });
    }, 500);
  } else {
    toggle.textContent = 'START';
    clearInterval(pathInterval);
    resetPath();
  }
});

function resetPath() {
  cells.forEach(cell => cell.classList.remove('path'));
}

function startMoving(dir) {
  if (moveInterval) clearInterval(moveInterval);

  moveInterval = setInterval(() => {
    if (dir === 'w' && self.y > 0 && !obstacles.some(o => o.x === self.x && o.y === self.y - 1)) self.y--;
    else if (dir === 's' && self.y < gridHeight - 1 && !obstacles.some(o => o.x === self.x && o.y === self.y + 1)) self.y++;
    else if (dir === 'a' && self.x > 0 && !obstacles.some(o => o.x === self.x - 1 && o.y === self.y)) self.x--;
    else if (dir === 'd' && self.x < gridWidth - 1 && !obstacles.some(o => o.x === self.x + 1 && o.y === self.y)) self.x++;
    draw();

    if (pathActive) {
      pathWorker.postMessage({
        player: self,
        target: target2,
        obstacles: obstacles,
        gridWidth: gridWidth,
        gridHeight: gridHeight
      });
    }
  }, 55);
}
function stopMoving() {
  clearInterval(moveInterval);
}


let currentDirection = null;
document.addEventListener('keydown', function(event) {
  if (['w', 'a', 's', 'd'].includes(event.key) && !currentDirection) {
    currentDirection = event.key;
    startMoving(currentDirection);
  }
});
document.addEventListener('keyup', function(event) {
  if (event.key == currentDirection) {
    stopMoving();
    currentDirection = null;
  }
});
draw();

// ----------------------------------------------------
// Socket.IO Connection & QR Code Generation
// ----------------------------------------------------
const socket = io(window.location.origin);
const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();

// HUD HTML Elements
const connStatusText = document.getElementById('connection-status');
const highScoreVal = document.getElementById('high-score-val');
const connectionOverlay = document.getElementById('connection-overlay');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreText = document.getElementById('final-score');
const finalComboText = document.getElementById('final-combo');
const mousePlayBtn = document.getElementById('mouse-play-btn');

// Controller coordinates / states received from mobile
let controllerState = {
  x: 0.5,
  y: 0.5,
  isSlashing: false,
  lastSwingTime: 0,
  active: false
};

// Generate QR Code containing the mobile controller join URL
const mobileUrl = `${window.location.origin}/mobile?room=${roomId}`;
new QRCode(document.getElementById("qrcode"), {
  text: mobileUrl,
  width: 160,
  height: 160,
  colorDark : "#05050a",
  colorLight : "#ffffff",
  correctLevel : QRCode.CorrectLevel.H
});

// Join the Socket.IO room as desktop
socket.emit('join-room', { roomId, role: 'desktop' });
console.log(`📡 Desktop joining room: ${roomId}`);

// Connect Socket event listeners
socket.on('connect', () => {
  console.log(`Socket connected. Room ID: ${roomId}`);
});

socket.on('controller-status', (data) => {
  if (data.connected) {
    console.log("📱 Controller connected!");
    controllerState.active = true;
    connStatusText.innerText = "CONTROLLER CONNECTED";
    connStatusText.parentElement.className = "status-connected";
    connectionOverlay.classList.add('hidden');
    
    // Start game if it was not started
    if (window.gameScene && window.gameScene.scene.isPaused()) {
      window.gameScene.scene.resume();
    } else if (window.gameScene && !window.gameScene.isPlaying) {
      window.gameScene.startGame();
    }
  } else {
    console.log("📱 Controller disconnected");
    controllerState.active = false;
    connStatusText.innerText = "CONTROLLER DISCONNECTED";
    connStatusText.parentElement.className = "status-disconnected";
    
    // Auto pause or show overlay
    if (window.gameScene && window.gameScene.isPlaying) {
      // Keep running but show overlay
      connectionOverlay.classList.remove('hidden');
    }
  }
});

socket.on('sensor-data', (data) => {
  controllerState.active = true;

  if (data.type === 'motion' || data.type === 'touch') {
    controllerState.x = data.x;
    controllerState.y = data.y;
    controllerState.isSlashing = data.isSlashing;
  }
  else if (data.type === 'trigger-state') {
    controllerState.isSlashing = data.isSlashing;
  }
  else if (data.type === 'swing-spike') {
    controllerState.lastSwingTime = Date.now();
    // Simulate sword whoosh sound on aggressive swings
    window.synth.playSwing();
  }
  else if (data.type === 'touch-end') {
    controllerState.isSlashing = false;
  }
  else if (data.type === 'restart') {
    if (window.gameScene) {
      window.gameScene.startGame();
    }
  }
});

socket.on('calibrate', () => {
  console.log("🎯 Calibration triggered");
  if (window.gameScene) {
    window.gameScene.flashScreen();
  }
});

// Allow Mouse Controls fallback on button press
mousePlayBtn.addEventListener('click', () => {
  controllerState.active = true;
  connectionOverlay.classList.add('hidden');
  if (window.gameScene) {
    window.gameScene.useMouse = true;
    window.gameScene.startGame();
  }
});

// Read High Score from local storage
let savedHighScore = localStorage.getItem('neon_slash_high_score') || 0;
highScoreVal.innerText = String(savedHighScore).padStart(5, '0');

// ----------------------------------------------------
// Phaser.js Game Setup
// ----------------------------------------------------
class MainGameScene extends Phaser.Scene {
  constructor() {
    super('MainGameScene');
    this.isPlaying = false;
    this.useMouse = false;
    this.score = 0;
    this.lives = 3;
    this.maxCombo = 0;
    this.slicedThisSwing = [];
    this.comboTimer = null;
    
    // Sword coordinates smoothing
    this.swordX = window.innerWidth / 2;
    this.swordY = window.innerHeight / 2;
    this.lastSwordX = this.swordX;
    this.lastSwordY = this.swordY;
    this.trailPoints = [];
    this.maxTrailPoints = 15;
  }

  init() {
    window.gameScene = this;
  }

  preload() {
    // We generate all textures procedurally to have a self-contained code repository.
    this.createProceduralTextures();
  }

  create() {
    this.physics.world.setBounds(0, 0, this.sys.game.config.width, this.sys.game.config.height + 200);
    this.physics.world.gravity.y = 450; // Set world gravity for falling fruits

    // Groups for game objects
    this.fruitsGroup = this.physics.add.group();
    this.halvesGroup = this.physics.add.group();
    this.bombsGroup = this.physics.add.group();

    // Sword trail graphics
    this.trailGraphics = this.add.graphics();
    this.trailGraphics.setDepth(100);

    // Juice splash particles
    this.juiceEmitter = this.add.particles(0, 0, 'particle', {
      lifespan: 800,
      speed: { min: 100, max: 250 },
      scale: { start: 1.0, end: 0 },
      gravityY: 500,
      blendMode: 'ADD',
      emitting: false
    });
    this.juiceEmitter.setDepth(50);

    // Spark particles for bomb fuses
    this.sparkEmitter = this.add.particles(0, 0, 'particle', {
      lifespan: 300,
      speed: { min: 40, max: 80 },
      scale: { start: 0.6, end: 0 },
      tint: 0xffaa00,
      blendMode: 'ADD',
      emitting: true,
      frequency: 30
    });
    this.sparkEmitter.setDepth(60);

    // Setup input listener if mouse play is chosen
    this.input.on('pointermove', (pointer) => {
      if (this.useMouse) {
        controllerState.x = pointer.x / this.sys.game.config.width;
        controllerState.y = pointer.y / this.sys.game.config.height;
        controllerState.isSlashing = pointer.isDown;
      }
    });

    this.input.on('pointerdown', () => {
      if (this.useMouse) {
        controllerState.isSlashing = true;
        window.synth.init(); // Initialize audio context on click
      }
    });

    this.input.on('pointerup', () => {
      if (this.useMouse) {
        controllerState.isSlashing = false;
      }
    });

    // Score & Floating Text styles
    this.scoreText = this.add.text(40, 90, 'SCORE: 0', {
      fontFamily: 'Orbitron',
      fontSize: '24px',
      fontWeight: 'bold',
      fill: '#00ffff'
    }).setDepth(90);

    // Create lives visual container
    this.livesContainer = this.add.container(40, 130).setDepth(90);
    this.drawLives();

    // Spawning loop event (initially inactive)
    this.spawnTimer = this.time.addEvent({
      delay: 1700,
      callback: this.spawnWave,
      callbackScope: this,
      loop: true,
      paused: true
    });

    // Instructions on screen
    this.instructionText = this.add.text(this.sys.game.config.width / 2, this.sys.game.config.height / 2 + 100, 'WAITING FOR CONTROLLER...', {
      fontFamily: 'Orbitron',
      fontSize: '20px',
      fill: '#8b8b9f',
      align: 'center'
    }).setOrigin(0.5).setDepth(90);

    // Initial scale adjustment
    this.scale.on('resize', this.resize, this);
  }

  update() {
    this.updateSwordPosition();
    this.drawSwordTrail();

    if (this.isPlaying) {
      this.checkCollisions();
      this.checkOffscreen();
      
      // Update fuse spark emitters to follow active bombs
      this.bombsGroup.children.iterate((bomb) => {
        if (bomb && bomb.active) {
          // Fuse offsets
          this.sparkEmitter.emitParticleAt(bomb.x + 20, bomb.y - 20);
        }
      });
    }
  }

  // ----------------------------------------------------
  // Game Loop Controls (Start, GameOver, Restart)
  // ----------------------------------------------------
  startGame() {
    this.isPlaying = true;
    this.score = 0;
    this.lives = 3;
    this.maxCombo = 0;
    this.scoreText.setText('SCORE: 0');
    this.instructionText.setVisible(false);
    gameOverScreen.classList.add('hidden');
    connectionOverlay.classList.add('hidden');
    
    // Clear any existing entities
    this.fruitsGroup.clear(true, true);
    this.halvesGroup.clear(true, true);
    this.bombsGroup.clear(true, true);

    this.drawLives();
    this.spawnTimer.paused = false;
    
    // Initialize Web Audio Synth
    window.synth.init();
    console.log("🎮 Game Session Started.");
  }

  endGame() {
    this.isPlaying = false;
    this.spawnTimer.paused = true;
    
    // Play Game Over Sound
    window.synth.playGameOver();

    // Update High Scores
    if (this.score > savedHighScore) {
      savedHighScore = this.score;
      localStorage.setItem('neon_slash_high_score', savedHighScore);
      highScoreVal.innerText = String(savedHighScore).padStart(5, '0');
    }

    // Set mobile controller buttons
    if (socket && controllerState.active) {
      socket.emit('sensor-data', { type: 'gameover' });
    }

    // Show HTML Game Over Overlay
    finalScoreText.innerText = this.score;
    finalComboText.innerText = `${this.maxCombo}x`;
    gameOverScreen.classList.remove('hidden');
  }

  flashScreen() {
    this.cameras.main.flash(200, 0, 240, 255);
  }

  // ----------------------------------------------------
  // Fruit Spawning Mechanics
  // ----------------------------------------------------
  spawnWave() {
    if (!this.isPlaying) return;

    const count = Phaser.Math.Between(1, 3);
    const fruitTypes = ['watermelon', 'orange', 'apple', 'coconut'];

    for (let i = 0; i < count; i++) {
      // 15% chance to spawn a bomb instead
      const spawnBomb = Phaser.Math.Between(1, 100) <= 15;
      
      const startX = Phaser.Math.Between(150, this.sys.game.config.width - 150);
      const startY = this.sys.game.config.height + 50;

      // Calculate trajectory arcs
      const velX = Phaser.Math.Between(-150, 150);
      const velY = Phaser.Math.Between(-550, -700); // Throw upwards

      if (spawnBomb) {
        const bomb = this.bombsGroup.create(startX, startY, 'bomb');
        bomb.setCircle(32);
        bomb.body.setVelocity(velX, velY);
        bomb.body.setAngularVelocity(Phaser.Math.Between(-150, 150));
      } else {
        const type = Phaser.Utils.Array.GetRandom(fruitTypes);
        const fruit = this.fruitsGroup.create(startX, startY, type);
        
        // Define metadata on fruit body
        fruit.fruitType = type;
        fruit.isSliced = false;

        // Custom radius for collision mapping
        let radius = 32;
        if (type === 'watermelon') radius = 40;
        if (type === 'orange') radius = 30;
        if (type === 'coconut') radius = 35;
        fruit.setCircle(radius);

        fruit.body.setVelocity(velX, velY);
        // Spin the fruit as it rises
        fruit.body.setAngularVelocity(Phaser.Math.Between(-200, 200));
      }
    }
  }

  // ----------------------------------------------------
  // Collision & Slicing Math
  // ----------------------------------------------------
  checkCollisions() {
    if (!controllerState.isSlashing || this.trailPoints.length < 2) return;

    // Create line segment representing sword stroke this frame
    const swordLine = new Phaser.Geom.Line(
      this.lastSwordX,
      this.lastSwordY,
      this.swordX,
      this.swordY
    );

    // 1. Check Collisions with Fruits
    this.fruitsGroup.children.iterate((fruit) => {
      if (!fruit || !fruit.active || fruit.isSliced) return;

      const fruitCircle = new Phaser.Geom.Circle(fruit.x, fruit.y, fruit.body.radius);

      if (Phaser.Geom.Intersects.LineToCircle(swordLine, fruitCircle)) {
        this.sliceFruit(fruit);
      }
    });

    // 2. Check Collisions with Bombs
    this.bombsGroup.children.iterate((bomb) => {
      if (!bomb || !bomb.active) return;

      const bombCircle = new Phaser.Geom.Circle(bomb.x, bomb.y, bomb.body.radius);

      if (Phaser.Geom.Intersects.LineToCircle(swordLine, bombCircle)) {
        this.detonateBomb(bomb);
      }
    });
  }

  sliceFruit(fruit) {
    fruit.isSliced = true;
    
    // Play slice synth sound
    window.synth.playSplat();

    // Trigger juice splatter particles tinted to match fruit flesh
    let tint = 0xffffff;
    if (fruit.fruitType === 'watermelon') tint = 0xff2a55;
    if (fruit.fruitType === 'orange') tint = 0xffaa00;
    if (fruit.fruitType === 'apple') tint = 0xeeff88;
    if (fruit.fruitType === 'coconut') tint = 0xf0f0ff;

    this.juiceEmitter.setParticleTint(tint);
    this.juiceEmitter.emitParticle(15, fruit.x, fruit.y);

    // Spawn fruit halves flying apart
    this.spawnHalves(fruit);

    // Score & Combo calculation
    this.score += 100;
    this.scoreText.setText(`SCORE: ${this.score}`);

    this.trackCombo(fruit.x, fruit.y);

    // Destroy primary fruit body
    fruit.destroy();
  }

  spawnHalves(fruit) {
    const vx = fruit.body.velocity.x;
    const vy = fruit.body.velocity.y;

    // Left Half
    const halfLeft = this.halvesGroup.create(fruit.x - 10, fruit.y, `${fruit.fruitType}_left`);
    halfLeft.body.setVelocity(vx - 80, vy - 50);
    halfLeft.body.setAngularVelocity(-250);

    // Right Half
    const halfRight = this.halvesGroup.create(fruit.x + 10, fruit.y, `${fruit.fruitType}_right`);
    halfRight.body.setVelocity(vx + 80, vy - 50);
    halfRight.body.setAngularVelocity(250);

    // Automatically clean up halves after they fall off-screen
    this.time.delayedCall(1500, () => {
      if (halfLeft) halfLeft.destroy();
      if (halfRight) halfRight.destroy();
    });
  }

  detonateBomb(bomb) {
    // Explode!
    window.synth.playExplosion();
    this.cameras.main.shake(400, 0.04);
    
    // Explosion particles
    this.juiceEmitter.setParticleTint(0xff3300);
    this.juiceEmitter.emitParticle(40, bomb.x, bomb.y);

    bomb.destroy();
    this.lives = 0;
    this.drawLives();
    this.endGame();
  }

  // ----------------------------------------------------
  // Combo Tracker
  // ----------------------------------------------------
  trackCombo(x, y) {
    // Append to combo list
    this.slicedThisSwing.push({ x, y });

    // Cancel old timer, trigger check in 350ms (window window to slice multiple fruits)
    if (this.comboTimer) this.comboTimer.remove();

    this.comboTimer = this.time.delayedCall(350, () => {
      const count = this.slicedThisSwing.length;
      if (count >= 2) {
        const comboPoints = count * 150;
        this.score += comboPoints;
        this.scoreText.setText(`SCORE: ${this.score}`);
        
        if (count > this.maxCombo) {
          this.maxCombo = count;
        }

        // Play combo synth sequence
        window.synth.playCombo();

        // Spawn neon floating combo text
        this.showComboText(x, y - 50, `${count}x COMBO`, comboPoints);
      }
      this.slicedThisSwing = [];
    });
  }

  showComboText(x, y, label, bonus) {
    const container = this.add.container(x, y).setDepth(80);
    
    const textCombo = this.add.text(0, 0, label, {
      fontFamily: 'Orbitron',
      fontSize: '28px',
      fontWeight: 'bold',
      fill: '#ff00ff'
    }).setOrigin(0.5);
    textCombo.setStroke('#000000', 6);

    const textBonus = this.add.text(0, 30, `+${bonus} PTS`, {
      fontFamily: 'Orbitron',
      fontSize: '18px',
      fill: '#00ffff'
    }).setOrigin(0.5);
    textBonus.setStroke('#000000', 4);

    container.add([textCombo, textBonus]);

    // Tween effect: floating up & fading away
    this.tweens.add({
      targets: container,
      y: y - 80,
      alpha: 0,
      duration: 1000,
      onComplete: () => {
        container.destroy();
      }
    });
  }

  // ----------------------------------------------------
  // Offscreen & Missed Fruit Checks
  // ----------------------------------------------------
  checkOffscreen() {
    // Clean up fruits that fall off-screen
    this.fruitsGroup.children.iterate((fruit) => {
      if (fruit && fruit.y > this.sys.game.config.height + 60) {
        // Player missed fruit! Lose a life
        fruit.destroy();
        this.loseLife();
      }
    });

    // Clean up off-screen bombs silently
    this.bombsGroup.children.iterate((bomb) => {
      if (bomb && bomb.y > this.sys.game.config.height + 60) {
        bomb.destroy();
      }
    });
  }

  loseLife() {
    this.lives--;
    this.drawLives();

    // Flash screen red briefly
    this.cameras.main.flash(100, 255, 0, 80, 0.4);

    if (this.lives <= 0) {
      this.endGame();
    }
  }

  drawLives() {
    this.livesContainer.removeAll(true);
    
    // Draw neon health indicators (hearts represented as blocks or icons)
    const spacing = 35;
    for (let i = 0; i < 3; i++) {
      const active = i < this.lives;
      
      const indicator = this.add.graphics();
      if (active) {
        // Red neon square block
        indicator.fillStyle(0xff3366, 1);
        indicator.lineStyle(2, 0xffffff, 1);
        indicator.fillRect(i * spacing, 0, 20, 20);
        indicator.strokeRect(i * spacing, 0, 20, 20);
      } else {
        // Empty gray indicator
        indicator.lineStyle(2, 0x444455, 1);
        indicator.strokeRect(i * spacing, 0, 20, 20);
      }
      this.livesContainer.add(indicator);
    }
  }

  // ----------------------------------------------------
  // Sword Position Interpolation & Trail Graphics
  // ----------------------------------------------------
  updateSwordPosition() {
    this.lastSwordX = this.swordX;
    this.lastSwordY = this.swordY;

    if (controllerState.active) {
      // Map percentages to actual game viewport dimensions
      const destX = controllerState.x * this.sys.game.config.width;
      const destY = controllerState.y * this.sys.game.config.height;

      // Linear interpolation to make cursor movements buttery smooth
      this.swordX = Phaser.Math.Linear(this.swordX, destX, 0.25);
      this.swordY = Phaser.Math.Linear(this.swordY, destY, 0.25);
    }

    // Append to coordinate points stack
    this.trailPoints.push({ x: this.swordX, y: this.swordY });
    if (this.trailPoints.length > this.maxTrailPoints) {
      this.trailPoints.shift();
    }
  }

  drawSwordTrail() {
    this.trailGraphics.clear();
    if (this.trailPoints.length < 2) return;

    // Draw fading trail blocks
    for (let i = 1; i < this.trailPoints.length; i++) {
      const p1 = this.trailPoints[i - 1];
      const p2 = this.trailPoints[i];

      const ageRatio = i / this.trailPoints.length; // 0 (oldest) to 1 (newest)
      
      let thickness = 3;
      let alpha = ageRatio * 0.4;
      let color = 0x8b8b9f; // default inactive grey color

      if (controllerState.isSlashing) {
        thickness = ageRatio * 9;
        alpha = ageRatio * 0.9;
        color = 0x00ffff; // Cyan neon when active
      }

      this.trailGraphics.lineStyle(thickness, color, alpha);
      this.trailGraphics.beginPath();
      this.trailGraphics.moveTo(p1.x, p1.y);
      this.trailGraphics.lineTo(p2.x, p2.y);
      this.trailGraphics.strokePath();

      // Draw white blade core overlay if active
      if (controllerState.isSlashing) {
        this.trailGraphics.lineStyle(thickness * 0.4, 0xffffff, alpha * 1.2);
        this.trailGraphics.beginPath();
        this.trailGraphics.moveTo(p1.x, p1.y);
        this.trailGraphics.lineTo(p2.x, p2.y);
        this.trailGraphics.strokePath();
      }
    }
  }

  // ----------------------------------------------------
  // Procedural Asset Generators (Graphics to Textures)
  // ----------------------------------------------------
  createProceduralTextures() {
    // Utility helper to create circular graphics
    const makeCircularTexture = (key, radius, renderCallback) => {
      const size = radius * 2 + 10;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      
      renderCallback(g, radius + 5);
      g.generateTexture(key, size, size);
    };

    // 1. Watermelon Whole
    makeCircularTexture('watermelon', 40, (g, c) => {
      g.fillStyle(0x0a4018, 1); // Dark rind
      g.fillCircle(c, c, 40);
      g.fillStyle(0x28a745, 1); // Light rind
      g.fillCircle(c, c, 37);
      g.fillStyle(0xff2d55, 1); // Pink/Red flesh
      g.fillCircle(c, c, 33);
      // Seed dots
      g.fillStyle(0x000000, 1);
      const seeds = [[-15,-5], [15,-5], [-5,15], [5,-15], [10,10], [-10,-10]];
      seeds.forEach(p => g.fillCircle(c + p[0], c + p[1], 2));
    });

    // 1a. Watermelon Left Half
    makeCircularTexture('watermelon_left', 40, (g, c) => {
      g.fillStyle(0x0a4018, 1);
      g.slice(c, c, 40, Math.PI / 2, (Math.PI * 3) / 2, false);
      g.fillPath();
      g.fillStyle(0x28a745, 1);
      g.slice(c, c, 37, Math.PI / 2, (Math.PI * 3) / 2, false);
      g.fillPath();
      g.fillStyle(0xff2d55, 1);
      g.slice(c, c, 33, Math.PI / 2, (Math.PI * 3) / 2, false);
      g.fillPath();
      g.fillStyle(0x000000, 1);
      const seeds = [[-15,-5], [-5,15], [-10,-10]];
      seeds.forEach(p => g.fillCircle(c + p[0], c + p[1], 2));
    });

    // 1b. Watermelon Right Half
    makeCircularTexture('watermelon_right', 40, (g, c) => {
      g.fillStyle(0x0a4018, 1);
      g.slice(c, c, 40, -Math.PI / 2, Math.PI / 2, false);
      g.fillPath();
      g.fillStyle(0x28a745, 1);
      g.slice(c, c, 37, -Math.PI / 2, Math.PI / 2, false);
      g.fillPath();
      g.fillStyle(0xff2d55, 1);
      g.slice(c, c, 33, -Math.PI / 2, Math.PI / 2, false);
      g.fillPath();
      g.fillStyle(0x000000, 1);
      const seeds = [[15,-5], [10,10]];
      seeds.forEach(p => g.fillCircle(c + p[0], c + p[1], 2));
    });

    // 2. Orange Whole
    makeCircularTexture('orange', 30, (g, c) => {
      g.fillStyle(0xff7700, 1); // Rind
      g.fillCircle(c, c, 30);
      g.fillStyle(0xffffff, 1); // Pith
      g.fillCircle(c, c, 27);
      g.fillStyle(0xffa200, 1); // Wedges
      g.fillCircle(c, c, 25);
      // Segment lines
      g.lineStyle(1.5, 0xffffff, 0.7);
      for(let a=0; a<Math.PI*2; a+=Math.PI/4) {
        g.lineBetween(c, c, c + Math.cos(a)*25, c + Math.sin(a)*25);
      }
    });

    // 2a. Orange Left Half
    makeCircularTexture('orange_left', 30, (g, c) => {
      g.fillStyle(0xff7700, 1);
      g.slice(c, c, 30, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
      g.fillStyle(0xffffff, 1);
      g.slice(c, c, 27, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
      g.fillStyle(0xffa200, 1);
      g.slice(c, c, 25, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
    });

    // 2b. Orange Right Half
    makeCircularTexture('orange_right', 30, (g, c) => {
      g.fillStyle(0xff7700, 1);
      g.slice(c, c, 30, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
      g.fillStyle(0xffffff, 1);
      g.slice(c, c, 27, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
      g.fillStyle(0xffa200, 1);
      g.slice(c, c, 25, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
    });

    // 3. Apple Whole
    makeCircularTexture('apple', 32, (g, c) => {
      g.fillStyle(0xff1133, 1); // Skin
      g.fillCircle(c, c, 32);
      // Apple leaf/stem details
      g.fillStyle(0x8b5a2b, 1); // stem
      g.fillRect(c - 2, c - 38, 4, 8);
      g.fillStyle(0x2da73c, 1); // leaf
      g.fillEllipse(c + 5, c - 36, 6, 3);
    });

    // 3a. Apple Left Half
    makeCircularTexture('apple_left', 32, (g, c) => {
      g.fillStyle(0xff1133, 1);
      g.slice(c, c, 32, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
      g.fillStyle(0xfffae0, 1); // Inner flesh
      g.slice(c, c, 28, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
      g.fillStyle(0x000000, 1); // Seed
      g.fillCircle(c - 8, c, 2.5);
    });

    // 3b. Apple Right Half
    makeCircularTexture('apple_right', 32, (g, c) => {
      g.fillStyle(0xff1133, 1);
      g.slice(c, c, 32, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
      g.fillStyle(0xfffae0, 1);
      g.slice(c, c, 28, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
      g.fillStyle(0x000000, 1);
      g.fillCircle(c + 8, c, 2.5);
    });

    // 4. Coconut Whole
    makeCircularTexture('coconut', 35, (g, c) => {
      g.fillStyle(0x4a2a14, 1); // Brown hairy shell
      g.fillCircle(c, c, 35);
      g.fillStyle(0xdcdcdc, 1); // Shell highlight
      g.fillCircle(c, c, 33);
      g.fillStyle(0x3e1f0e, 1); // Shell base
      g.fillCircle(c, c, 32);
      // Three coconut indentation dots
      g.fillStyle(0x1a0a03, 1);
      g.fillCircle(c - 8, c - 8, 3.5);
      g.fillCircle(c + 8, c - 8, 3.5);
      g.fillCircle(c, c + 8, 3.5);
    });

    // 4a. Coconut Left Half
    makeCircularTexture('coconut_left', 35, (g, c) => {
      g.fillStyle(0x3e1f0e, 1);
      g.slice(c, c, 35, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
      g.fillStyle(0xffffff, 1); // White flesh
      g.slice(c, c, 29, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
      g.fillStyle(0x000000, 1); // Hollow core
      g.slice(c, c, 23, Math.PI/2, (Math.PI*3)/2, false);
      g.fillPath();
    });

    // 4b. Coconut Right Half
    makeCircularTexture('coconut_right', 35, (g, c) => {
      g.fillStyle(0x3e1f0e, 1);
      g.slice(c, c, 35, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
      g.fillStyle(0xffffff, 1);
      g.slice(c, c, 29, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
      g.fillStyle(0x000000, 1);
      g.slice(c, c, 23, -Math.PI/2, Math.PI/2, false);
      g.fillPath();
    });

    // 5. Bomb
    makeCircularTexture('bomb', 32, (g, c) => {
      g.fillStyle(0x1a1a24, 1); // Metal sphere
      g.fillCircle(c, c, 32);
      g.lineStyle(2, 0xff0055, 1); // Red glowing warning bands
      g.strokeCircle(c, c, 26);
      g.fillStyle(0xff0055, 0.4);
      g.fillCircle(c, c, 18);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, c, 8); // Glowing center core
      
      // Fuse hilt
      g.fillStyle(0x888899, 1);
      g.fillRect(c + 10, c - 34, 10, 8);
      
      // Curved Fuse line
      g.lineStyle(2.5, 0xaaaa99, 1);
      g.beginPath();
      g.moveTo(c + 15, c - 34);
      g.quadraticCurveTo(c + 22, c - 45, c + 20, c - 50);
      g.strokePath();
    });

    // 6. Generic particle bullet
    makeCircularTexture('particle', 4, (g, c) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, c, 4);
    });
  }

  // ----------------------------------------------------
  // Responsiveness
  // ----------------------------------------------------
  resize(gameSize, baseSize, displaySize, resolution) {
    const width = gameSize.width;
    const height = gameSize.height;

    this.cameras.main.setSize(width, height);
    this.physics.world.setBounds(0, 0, width, height + 200);
  }
}

// Phaser configuration details
const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  transparent: true, // Let HTML CSS grid grid background shine through
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [MainGameScene]
};

// Create game instance
const game = new Phaser.Game(config);

// Resize game dynamically with viewport changes
window.addEventListener('resize', () => {
  if (game) {
    game.scale.resize(window.innerWidth, window.innerHeight);
  }
});

export interface CharacterControlCallbacks {
  startRunning(): void;
  stopRunning(): void;
  walkForward(): void;
  walkBackward(): void;
  stopWalking(): void;
  turnLeft(): void;
  turnRight(): void;
  stopTurning(): void;
  attack(index: number): void;
}

export function bindCharacterControls(callbacks: CharacterControlCallbacks): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        callbacks.startRunning();
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'KeyZ':
        callbacks.walkForward();
        break;
      case 'ArrowDown':
      case 'KeyS':
        callbacks.walkBackward();
        break;
      case 'ArrowLeft':
      case 'KeyA':
      case 'KeyQ':
        callbacks.turnLeft();
        break;
      case 'ArrowRight':
      case 'KeyD':
        callbacks.turnRight();
        break;
      case 'Digit1':
        callbacks.attack(1);
        break;
      case 'Digit2':
        callbacks.attack(2);
        break;
      case 'Digit3':
        callbacks.attack(3);
        break;
      case 'Digit4':
        callbacks.attack(4);
        break;
      case 'Digit5':
        callbacks.attack(5);
        break;
      case 'Digit6':
        callbacks.attack(6);
        break;
      case 'Digit7':
        callbacks.attack(7);
        break;
      case 'Digit8':
        callbacks.attack(8);
        break;
      case 'Digit9':
        callbacks.attack(9);
        break;
    }
  });

  document.addEventListener('keyup', (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        callbacks.stopRunning();
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'KeyZ':
      case 'ArrowDown':
      case 'KeyS':
        callbacks.stopWalking();
        break;
      case 'ArrowLeft':
      case 'KeyA':
      case 'KeyQ':
      case 'ArrowRight':
      case 'KeyD':
        callbacks.stopTurning();
        break;
    }
  });
}

// Boot order matters: FRGen registers window.FRGen, the theatre registers
// window.SD_THEATRE, then the legacy game IIFE runs and finds both.
import './legacy/frgen.js';
import './theatre/index.js';
import './legacy/game.js';

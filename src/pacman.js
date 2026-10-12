import {$, el} from './core.js';
import {PacmanSession} from './pacman/session.js';
import {drawGame, GHOST_COLORS} from './pacman/render.js';
import {Thinking} from './pacman/thinking.js';
import {Sound, snapshot, cuesBetween} from './pacman/sound.js';
import {attachTouch} from './pacman/touch.js';
import {ACTOR_NAMES, summarizeState} from './pacman/brain.js';

export function initPacman(client, toast) {
  const canvas = $('#pacman-canvas'), ctx = canvas.getContext('2d');
  const sound = new Sound(), thinking = new Thinking();
  let visible = false, raf = 0, last = 0, accumulator = 0, hudAt = 0, started = false;
  let request = null, response = null;
  const cards = new Map();
  const game = new PacmanSession(client, event => {
    if (event.type === 'decision') {
      const d = event.decision;
      thinking.add(d, performance.now());
      let card = cards.get(d.actor);
      if (!card) {
        card = el('div', {class:'pacman-decision'});
        card.style.setProperty('--actor', d.actor === 'pacman' ? '#ffd800' : GHOST_COLORS[d.actor]);
        cards.set(d.actor, card); $('#pacman-decisions').append(card);
      }
      card.replaceChildren(el('strong', {}, ACTOR_NAMES[d.actor]), el('span', {}, d.choice + (d.escape ? ' · escape' : '')));
      for (const dir of d.options) {
        const p = d.probabilities[dir];
        card.append(el('small', {}, `${dir} ${Number.isFinite(p) ? (p*100).toFixed(1)+'%' : '—'}`));
      }
    } else if (event.type === 'request') request = event.body;
    else if (event.type === 'response') response = event.body;
    else if (event.type === 'error') {
      sound.stop(); toast(event.message); draw();
    }
  });
  function hud() {
    const s = game.state;
    $('#pacman-score').textContent = s.score.toLocaleString();
    $('#pacman-lives').textContent = s.lives;
    $('#pacman-level').textContent = s.level;
    $('#pacman-pellets').textContent = s.maze.pellets.size + s.maze.powerPellets.size;
    $('#pacman-calls').textContent = game.stats.calls;
    $('#pacman-pending').textContent = game.slots.inFlight;
    $('#pacman-latency').textContent = game.stats.latencyMs === null ? '—' : `${Math.round(game.stats.latencyMs)} ms`;
    $('#pacman-status').textContent = game.error || (game.active ? s.status.toUpperCase() : s.status === 'gameover' ? 'GAME OVER' : started ? 'PAUSED' : 'READY');
    $('#pacman-status').classList.toggle('error', !!game.error);
    $('#pacman-start').textContent = s.status === 'gameover' ? 'New game' : started ? 'Resume' : 'Start';
    $('#pacman-start').disabled = game.active;
    $('#pacman-pause').disabled = !game.active;
    $('#pacman-pad').hidden = s.pacmanControl !== 'keyboard';
    $('#pacman-sound').textContent = sound.enabled ? 'Sound on' : 'Sound off';
    $('#pacman-sound').setAttribute('aria-pressed', String(sound.enabled));
    if ($('#pacman-inspect').open) $('#pacman-state').textContent = JSON.stringify({state:summarizeState(s), request, response}, null, 2);
  }
  function draw(now = performance.now()) {
    drawGame(ctx, game.state, now/1000, started && !game.active && game.state.status !== 'gameover');
    if (game.active && $('#pacman-odds').checked) thinking.draw(ctx, now);
    hud();
  }
  function frame(now) {
    raf = 0;
    if (!visible) return;
    if (game.active) {
      accumulator += Math.min(.05, Math.max(0, (now-last)/1000)) * Number($('#pacman-speed').value);
      const before = snapshot(game.state);
      while (accumulator >= 1/60 && game.active) {
        game.tick(1/60); accumulator -= 1/60;
      }
      for (const cue of cuesBetween(before, game.state)) sound.play(cue);
    } else accumulator = 0;
    last = now;
    drawGame(ctx, game.state, now/1000, started && !game.active && game.state.status !== 'gameover');
    if (game.active && $('#pacman-odds').checked) thinking.draw(ctx, now);
    if (now-hudAt > 150) {hud(); hudAt=now;}
    raf = requestAnimationFrame(frame);
  }
  function stop() {game.stop(); sound.stop(); accumulator=0; draw();}
  function reset() {
    stop(); game.reset($('#pacman-mode').value); started=false; thinking.clear();
    cards.clear(); $('#pacman-decisions').replaceChildren(); request=null; response=null; draw();
  }
  function start() {
    if (!visible || document.hidden) return;
    if (game.state.status === 'gameover') reset();
    const first = !started;
    started=true; game.start(); sound.unlock(); if (first) sound.play('start');
    last=performance.now(); accumulator=0; canvas.focus({preventScroll:true}); hud();
  }
  $('#pacman-start').onclick=start; $('#pacman-pause').onclick=stop;
  $('#pacman-reset').onclick=reset; $('#pacman-mode').onchange=reset;
  $('#pacman-sound').onclick=()=>{sound.toggle(); if(sound.enabled && game.active)sound.unlock(); else sound.stop(); hud();};
  $('#pacman-inspect').ontoggle=hud;
  canvas.onclick=()=>{if(!game.active)start();};
  const keys={ArrowUp:'up',KeyW:'up',ArrowLeft:'left',KeyA:'left',ArrowDown:'down',KeyS:'down',ArrowRight:'right',KeyD:'right'};
  document.addEventListener('keydown', e => {
    if (!visible || $('#settings').open || e.target.closest('input,textarea,select,button') || e.target.isContentEditable) return;
    if (keys[e.code]) {e.preventDefault(); game.steer(keys[e.code]);}
    else if (e.code === 'Space') {e.preventDefault(); game.active ? stop() : start();}
    else if (e.code === 'KeyR') {reset(); start();}
  });
  for (const b of document.querySelectorAll('[data-pacman-dir]')) b.onpointerdown=e=>{e.preventDefault();game.steer(b.dataset.pacmanDir);canvas.focus({preventScroll:true});};
  attachTouch(canvas, dir=>game.steer(dir), ()=>visible && game.active && game.state.pacmanControl==='keyboard');
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  draw();
  return {stop, setVisible(value) {
    if (visible===value) return;
    visible=value;
    if (!visible) {stop(); cancelAnimationFrame(raf); raf=0;}
    else {last=performance.now(); draw(); if(!raf)raf=requestAnimationFrame(frame);}
  }};
}

// 퀴즈 정답/오답 효과음 — Web Audio API 합성 (파일 불필요)
// 사용:
//   <script src="/assets/quiz/quiz-fx.js"></script>
//   QuizFx.playCorrect();   // 정답 시 (밝은 상승 chord)
//   QuizFx.playWrong();     // 오답 시 (낮은 부정 buzz)
//
// iOS Safari/Chrome 정책: 사용자 제스처 이후에만 재생 가능.
// 따라서 페이지 첫 클릭 시 ctx.resume() 트리거하거나, 답안 제출 직후 호출.

(function (global) {
  let _ctx = null;
  function ctx() {
    if (!_ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      _ctx = new AC();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function tone(freq, startOffset, duration, gainPeak, type) {
    const ac = ctx(); if (!ac) return;
    const t0 = ac.currentTime + startOffset;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function playCorrect() {
    // C5(523) → E5(659) → G5(784) → C6(1046) 빠른 상승
    tone(523.25, 0.00, 0.18, 0.25, 'triangle');
    tone(659.25, 0.10, 0.18, 0.25, 'triangle');
    tone(783.99, 0.20, 0.22, 0.25, 'triangle');
    tone(1046.50, 0.30, 0.40, 0.28, 'triangle');
  }

  function playWrong() {
    // 낮은 dissonance: A3 + Bb3 동시 + 톤 down
    tone(220.00, 0.00, 0.45, 0.20, 'sawtooth');
    tone(233.08, 0.00, 0.45, 0.20, 'sawtooth');
    tone(196.00, 0.20, 0.35, 0.18, 'sawtooth');
  }

  global.QuizFx = { playCorrect, playWrong };
})(window);

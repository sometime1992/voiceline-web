'use strict';
// Local-only diagnostics. Do not collect audio, identifiers, location, or transmit reports.
(() => {
  const $ = id => document.getElementById(id);
  const VERSION = '1.3.1';
  let lastError = '';
  const runtimeErrors = [];
  const message = error => String(error || '').slice(0, 200);
  const capture = value => {
    const text = message(value);
    if (!text) return;
    runtimeErrors.push(text);
    while (runtimeErrors.length > 5) runtimeErrors.shift();
    if ($('diagnosticDetails')?.open) refresh();
  };
  window.addEventListener('error', event => {
    if (event.target !== window) {
      capture('파일 불러오기 실패: ' + (event.target?.src || event.target?.href || event.target?.tagName));
    } else {
      capture(event.message + (event.filename ? ' · ' + event.filename.split('/').pop() : ''));
    }
  }, true);
  window.addEventListener('unhandledrejection', event => capture('비동기 오류: ' + (event.reason?.message || event.reason)));

  async function getReport() {
    const native = /\bwv\b|; wv\)/i.test(navigator.userAgent) || location.hostname === 'appassets.androidplatform.net';
    let micPermission = '확인 불가 (앱의 마이크 시작 버튼에서 요청)';
    if (navigator.permissions?.query) {
      try { micPermission = (await navigator.permissions.query({name:'microphone'})).state; }
      catch (_) { /* some Android WebView versions do not support microphone permission queries */ }
    }
    let inputStatus = '연결 안 됨';
    if (typeof state !== 'undefined' && state.running) {
      const live = $('micInputStatus')?.textContent || '';
      inputStatus = live || '마이크 연결됨';
    }
    return [
      '보이스라인 버전: v' + VERSION,
      '앱 실행 환경: ' + (native ? 'Android 앱 WebView' : '웹 브라우저'),
      '보안 환경: ' + (window.isSecureContext ? '정상' : '보안 환경 아님'),
      '마이크 API: ' + (navigator.mediaDevices?.getUserMedia ? '지원' : '지원하지 않음'),
      'Web Audio: ' + ((window.AudioContext || window.webkitAudioContext) ? '지원' : '지원하지 않음'),
      '마이크 권한: ' + micPermission,
      '마이크 입력: ' + inputStatus,
      '최근 마이크 오류: ' + (lastError || '없음'),
      '스크립트/리소스 오류: ' + (runtimeErrors.length ? runtimeErrors.join(' / ') : '발견되지 않음'),
    ].join('\n');
  }
  async function refresh() {
    const display = $('diagnosticData');
    if (!display) return;
    display.textContent = await getReport();
  }
  async function copy() {
    const report = await getReport();
    const btn = $('diagnosticCopy');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(report);
      else {
        const temp = document.createElement('textarea'); temp.value = report;
        temp.style.position = 'fixed'; temp.style.opacity = '0';
        document.body.append(temp); temp.focus(); temp.select();
        const ok = document.execCommand('copy');temp.remove();
        if (!ok) throw new Error('복사 지원 안 됨');
      }
      btn.textContent = '복사 완료';
    } catch (_) {
      btn.textContent = '위 내용을 길게 눌러 복사하세요';
    }
  }
  window.VoiceLineDiagnostics = {
    refresh,
    setError(text) {lastError = message(text); if ($('diagnosticDetails')?.open) refresh();},
  };
  $('diagnosticRefresh')?.addEventListener('click',refresh);
  $('diagnosticCopy')?.addEventListener('click',copy);
  $('diagnosticDetails')?.addEventListener('toggle', () => {if ($('diagnosticDetails').open) refresh();});
  document.addEventListener('DOMContentLoaded', refresh);
})();

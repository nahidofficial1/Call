console.clear = () => console.log('Console was cleared');

window.captchaSolved = false;
window.captchaPromiseResolve = null;
window.captchaPromise = new Promise(resolve => {
  window.captchaPromiseResolve = resolve;
});

const i = setInterval(() => {
  if (window.turnstile) {
    clearInterval(i);
    const originalRender = window.turnstile.render;
    window.turnstile.render = (a, b) => {
      let params = {
        sitekey: b.sitekey,
        pageurl: window.location.href,
        data: b.cData,
        pagedata: b.chlPageData,
        action: b.action,
        userAgent: navigator.userAgent,
        json: 1
      };
      console.log('intercepted-params:' + JSON.stringify(params));
      
      window.cfOriginalCallback = b.callback;
      b.callback = (token) => {
        console.log('captcha-solved-automatically');
        window.captchaSolved = true;
        if (window.captchaPromiseResolve) {
          window.captchaPromiseResolve(token);
        }
        if (window.cfOriginalCallback) {
          window.cfOriginalCallback(token);
        }
      };
      
      return originalRender.call(window.turnstile, a, b);
    };
  }
}, 50);

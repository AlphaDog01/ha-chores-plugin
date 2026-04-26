(() => {
  const injectButton = () => {
    // Only run on the login page
    if (!window.location.pathname.startsWith('/auth/authorize') && 
        !document.querySelector('home-assistant-main') === false) {
      return;
    }

    // Don't inject twice
    if (document.getElementById('hades-sso-btn')) return;

    const tryInject = () => {
      // Look for the login form
      const ha = document.querySelector('home-assistant');
      if (!ha || !ha.shadowRoot) return false;

      const haMain = ha.shadowRoot.querySelector('home-assistant-main') || 
                     ha.shadowRoot.querySelector('ha-onboarding');
      
      // Try to find the login card
      const loginCard = document.querySelector('ha-auth-flow') ||
                        (haMain && haMain.shadowRoot && haMain.shadowRoot.querySelector('ha-auth-flow'));

      if (!loginCard || !loginCard.shadowRoot) return false;

      const form = loginCard.shadowRoot.querySelector('form') ||
                   loginCard.shadowRoot.querySelector('.card-content');

      if (!form) return false;

      // Create the button
      const btn = document.createElement('button');
      btn.id = 'hades-sso-btn';
      btn.type = 'button';
      btn.innerText = '☠ Login with JumpCloud';
      btn.style.cssText = `
        width: 100%;
        margin-top: 16px;
        padding: 12px;
        background: #0d0f1a;
        color: #7F77DD;
        border: 1px solid #534AB7;
        border-radius: 4px;
        font-size: 14px;
        letter-spacing: 2px;
        cursor: pointer;
        transition: all 0.3s;
        font-family: inherit;
      `;
      btn.onmouseover = () => {
        btn.style.background = '#534AB7';
        btn.style.color = '#fff';
      };
      btn.onmouseout = () => {
        btn.style.background = '#0d0f1a';
        btn.style.color = '#7F77DD';
      };
      btn.onclick = () => {
        window.location.href = '/auth/hades/login';
      };

      form.appendChild(btn);
      return true;
    };

    // Keep trying until the login form appears
    const interval = setInterval(() => {
      if (tryInject()) clearInterval(interval);
    }, 300);

    // Give up after 15 seconds
    setTimeout(() => clearInterval(interval), 15000);
  };

  // Run on page load and on navigation
  injectButton();
  window.addEventListener('location-changed', injectButton);
  window.addEventListener('popstate', injectButton);
})();

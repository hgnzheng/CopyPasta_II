// applyURL.js
document.addEventListener('DOMContentLoaded', async function() {
    // 从 URL 中提取参数
    const urlParams = new URLSearchParams(window.location.search);
    const urlCaseId = urlParams.get('caseId');
    const urlOperationType = urlParams.get('operationType');
    const urlComplexity = urlParams.get('complexity');
    const urlTrackId = urlParams.get('trackId');
  
    // 如果所有参数都为空则直接跳过
    if (!urlCaseId || !urlOperationType || !urlComplexity || !urlTrackId) {
      hideLoadingOverlay();
      return;
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
    // showLoadingOverlay("Applying URL parameters...");
    await delay(100);
    showLoadingOverlay("Applying URL parameters...");
    
    // 按顺序依次更新参数，每一步延时 1 秒后更新下一个
    if (urlOperationType) {
      const operationSelect = document.getElementById('operationCategory');
      if (operationSelect) {
        operationSelect.value = urlOperationType;
        operationSelect.dispatchEvent(new Event('change'));
      }
    }
    
    showLoadingOverlay("Applying URL parameters...");
    if (urlComplexity) {
      const complexitySelect = document.getElementById('complexityLevel');
      if (complexitySelect) {
        complexitySelect.value = urlComplexity;
        complexitySelect.dispatchEvent(new Event('change'));
      }
    }

    showLoadingOverlay("Applying URL parameters...");
    await delay(200);
    showLoadingOverlay("Applying URL parameters...");

    if (urlCaseId) {
      const caseSelect = document.getElementById('caseSelector');
      if (caseSelect) {
        caseSelect.value = urlCaseId;
        caseSelect.dispatchEvent(new Event('change'));
      }
    }

    showLoadingOverlay("Applying URL parameters...");
    await delay(50);
    showLoadingOverlay("Applying URL parameters...");

    if (urlTrackId) {
      const trackSelect = document.getElementById('trackSelector');
      if (trackSelect) {
        trackSelect.value = urlTrackId;
        trackSelect.dispatchEvent(new Event('change'));
      }
    }

    hideLoadingOverlay();
  });
  
  

  function showLoadingOverlay(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    
    if (!overlay) {
      // Create loading overlay if it doesn't exist
      const newOverlay = document.createElement('div');
      newOverlay.id = 'loadingOverlay';
      
      newOverlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading</div>
        <div class="loading-message">${message}</div>
      `;
      
      document.body.appendChild(newOverlay);
      
      // Force reflow/repaint before adding visible class
      newOverlay.offsetHeight;
      newOverlay.classList.add('visible');
    } else {
      // Update existing overlay
      const messageEl = overlay.querySelector('.loading-message');
      if (messageEl) {
        messageEl.textContent = message;
      }
      overlay.classList.add('visible');
    }
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.remove('visible');
      
      // Remove from DOM after animation completes
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300); // Match the CSS transition time
    }
  }
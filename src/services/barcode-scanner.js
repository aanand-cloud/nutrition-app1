/** Barcode scan via camera (BarcodeDetector) or manual entry. */

export function canUseBarcodeCamera() {
  return Boolean(window.BarcodeDetector) && window.isSecureContext;
}

export function openBarcodeScannerModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'camera-modal';
    overlay.innerHTML = `
      <div class="camera-modal__panel camera-modal__panel--barcode">
        <h2 class="barcode-title">Scan barcode</h2>
        <p class="barcode-hint">Point at the barcode on packaged food</p>
        ${canUseBarcodeCamera() ? `<video class="camera-modal__video" playsinline autoplay muted></video>` : ''}
        <label class="field full">
          <span>Or type barcode number</span>
          <input type="text" inputmode="numeric" id="barcodeManual" placeholder="e.g. 5000159407236" autocomplete="off"/>
        </label>
        <div class="camera-modal__actions">
          <button type="button" class="btn btn-ghost" id="barcodeCancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="barcodeLookup">Look up</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const video = overlay.querySelector('video');
    let stream = null;
    let detector = null;
    let scanTimer = null;
    let done = false;

    function finish(code) {
      if (done) return;
      done = true;
      cleanup();
      resolve(code || null);
    }

    function cleanup() {
      if (scanTimer) clearInterval(scanTimer);
      stream?.getTracks().forEach((t) => t.stop());
      overlay.remove();
      document.body.style.overflow = '';
    }

    overlay.querySelector('#barcodeCancel').addEventListener('click', () => finish(null));

    overlay.querySelector('#barcodeLookup').addEventListener('click', () => {
      const code = overlay.querySelector('#barcodeManual').value.trim();
      if (code) finish(code);
    });

    overlay.querySelector('#barcodeManual').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const code = e.target.value.trim();
        if (code) finish(code);
      }
    });

    if (canUseBarcodeCamera() && video) {
      detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        .then((s) => {
          stream = s;
          video.srcObject = s;
          scanTimer = setInterval(async () => {
            if (!video.videoWidth || done) return;
            try {
              const codes = await detector.detect(video);
              const hit = codes.find((c) => c.rawValue);
              if (hit?.rawValue) finish(hit.rawValue);
            } catch {
              /* keep scanning */
            }
          }, 450);
        })
        .catch(() => {
          /* manual entry still works */
        });
    }
  });
}

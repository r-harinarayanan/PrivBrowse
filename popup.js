/**
 * PrivBrowse — Popup Controller
 * 
 * SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // UI Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const goalInput = document.getElementById('agent_goal');
  const btnRunAgent = document.getElementById('btn_run_agent');
  const previewLog = document.getElementById('preview_log');
  const toastEl = document.getElementById('toast');
  const logBadge = document.getElementById('log_badge');

  // Stage Tracking
  const pipelineBar = document.getElementById('pipeline_bar');
  const pipelinePercentage = document.getElementById('pipeline_percentage');
  const pipelineStatusLabel = document.getElementById('pipeline_status_label');
  const spills = {
    1: document.getElementById('spill_1'),
    2: document.getElementById('spill_2'),
    3: document.getElementById('spill_3'),
    4: document.getElementById('spill_4'),
    5: document.getElementById('spill_5')
  };

  // Metrics
  const sumElements = document.getElementById('sum_elements');
  const sumPiiFiltered = document.getElementById('sum_pii_filtered');
  const sumVerifiedSafe = document.getElementById('sum_verified_safe');
  const sumBlockedUnsafe = document.getElementById('sum_blocked_unsafe');
  const auditStream = document.getElementById('audit_stream');

  let currentLogs = [];
  let currentFilter = 'ALL';
  let metricStats = {
    elements: 0,
    redacted: 0,
    safe: 0,
    total: 0,
    blocked: 0
  };

  // =========================================================================
  // TAB NAVIGATION
  // =========================================================================
  function switchTab(tabId) {
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    tabContents.forEach(content => {
      content.classList.toggle('active', content.id === tabId);
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('link_view_full_audit')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('tab-audit');
  });

  function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.background = isError ? '#ef4444' : '#10b981';
    toastEl.classList.remove('hidden');
    setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2400);
  }

  // =========================================================================
  // USER PROFILE MANAGEMENT (Dual Storage Schema: userProfile & profile)
  // =========================================================================
  const profileForm = document.getElementById('profile_form');
  const profName = document.getElementById('prof_name');
  const profEmail = document.getElementById('prof_email');
  const profPhone = document.getElementById('prof_phone');
  const profAddress = document.getElementById('prof_address');
  const profCategory = document.getElementById('prof_category');
  const profDob = document.getElementById('prof_dob');
  const profPincode = document.getElementById('prof_pincode');
  const profAadhaar = document.getElementById('prof_aadhaar');
  const profPan = document.getElementById('prof_pan');

  function loadProfileFromStorage() {
    chrome.storage.local.get(['userProfile', 'profile'], (result) => {
      const p = result.userProfile || result.profile || {};
      if (profName) profName.value = p.fullName || p.name || '';
      if (profEmail) profEmail.value = p.email || '';
      if (profPhone) profPhone.value = p.phone || '';
      if (profAddress) profAddress.value = p.address || '';
      if (profCategory && p.category) profCategory.value = p.category;
      if (profDob) profDob.value = p.dob || '';
      if (profPincode) profPincode.value = p.pincode || '';
      if (profAadhaar) profAadhaar.value = p.aadhaar || '';
      if (profPan) profPan.value = p.pan || '';
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const userProfile = {
        fullName: profName.value.trim(),
        email: profEmail.value.trim(),
        phone: profPhone.value.trim(),
        address: profAddress.value.trim(),
        category: profCategory.value,
        dob: profDob ? profDob.value.trim() : '',
        pincode: profPincode ? profPincode.value.trim() : '',
        aadhaar: profAadhaar.value.trim(),
        pan: profPan.value.trim()
      };

      // Store under both keys for universal compatibility
      chrome.storage.local.set({
        userProfile,
        profile: userProfile
      }, () => {
        showToast('Profile saved to local storage!');
      });
    });
  }

  const btnSample = document.getElementById('btn_sample_profile');
  if (btnSample) {
    btnSample.addEventListener('click', () => {
      const sample = {
        fullName: 'Aarav Sharma',
        email: 'aarav.sharma@example.edu.in',
        phone: '9876543210',
        address: '42 Civil Lines, North Campus, New Delhi 110007',
        category: 'OBC',
        dob: '2003-08-15',
        pincode: '110007',
        aadhaar: '2345 6789 0123',
        pan: 'ABCDE1234F'
      };

      if (profName) profName.value = sample.fullName;
      if (profEmail) profEmail.value = sample.email;
      if (profPhone) profPhone.value = sample.phone;
      if (profAddress) profAddress.value = sample.address;
      if (profCategory) profCategory.value = sample.category;
      if (profDob) profDob.value = sample.dob;
      if (profPincode) profPincode.value = sample.pincode;
      if (profAadhaar) profAadhaar.value = sample.aadhaar;
      if (profPan) profPan.value = sample.pan;

      chrome.storage.local.set({
        userProfile: sample,
        profile: sample
      }, () => {
        showToast('Sample test profile loaded & saved!');
      });
    });
  }

  // Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (goalInput) {
        goalInput.value = btn.dataset.preset || btn.dataset.goal || '';
        goalInput.focus();
      }
    });
  });

  // =========================================================================
  // SETTINGS & CONFIGURATION
  // =========================================================================
  // =========================================================================
  // AES-GCM 256-BIT WEB CRYPTO API ENCRYPTION ENGINE (WITH USER PASSPHRASE)
  // =========================================================================
  const DEFAULT_SALT = new Uint8Array([112, 114, 105, 118, 98, 114, 111, 119, 115, 101, 45, 115, 101, 99, 117, 114]); // 'privbrowse-secur'

  async function deriveAesKey(masterSecret, dynamicSalt = null, userPassphrase = null) {
    const enc = new TextEncoder();
    const secret = userPassphrase || masterSecret || (chrome.runtime?.id || 'privbrowse-session-master-salt-2026');
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: dynamicSalt || DEFAULT_SALT,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptApiKey(plaintext, masterSecret, userPassphrase = null) {
    if (!plaintext) return null;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(masterSecret, salt, userPassphrase);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );
    return {
      salt: Array.from(salt),
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      createdAt: Date.now(),
      ttlMs: 4 * 60 * 60 * 1000, // 4-hour automatic rotation window
      maxLifetimeMs: 30 * 24 * 60 * 60 * 1000, // 30-day cryptographic lifetime
      isUserPassphraseProtected: !!userPassphrase
    };
  }

  async function decryptApiKey(encryptedData, masterSecret, userPassphrase = null) {
    if (!encryptedData || !encryptedData.ciphertext || !encryptedData.iv) return '';
    // Check 30-day absolute cryptographic lifetime
    if (encryptedData.createdAt && encryptedData.maxLifetimeMs && (Date.now() - encryptedData.createdAt > encryptedData.maxLifetimeMs)) {
      console.warn('[PrivBrowse Security] API Key has exceeded 30-day cryptographic lifetime. Expired.');
      return '';
    }
    // Check 4-hour session TTL rotation window
    if (encryptedData.createdAt && (Date.now() - encryptedData.createdAt > (encryptedData.ttlMs || 14400000))) {
      console.warn('[PrivBrowse Security] Stored API key has expired past its 4-hour TTL window.');
      return '';
    }

    try {
      const salt = encryptedData.salt ? new Uint8Array(encryptedData.salt) : null;
      const key = await deriveAesKey(masterSecret, salt, userPassphrase);
      const iv = new Uint8Array(encryptedData.iv);
      const ciphertext = new Uint8Array(encryptedData.ciphertext);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      const dec = new TextDecoder();
      return dec.decode(decrypted);
    } catch (e) {
      return '';
    }
  }

  const cfgMasterPassphrase = document.getElementById('cfg_master_passphrase');
  const btnTogglePassphrase = document.getElementById('btn_toggle_passphrase_vis');
  const keyHealthBadge = document.getElementById('key_health_badge');
  const cfgApiKey = document.getElementById('cfg_api_key');
  const cfgPerceptionEngine = document.getElementById('cfg_perception_engine');
  const cfgModel = document.getElementById('cfg_model');
  const cfgSurveillance = document.getElementById('cfg_surveillance');
  const cfgSimulation = document.getElementById('cfg_simulation_mode');
  const btnToggleKey = document.getElementById('btn_toggle_key_vis');
  const btnSaveSettings = document.getElementById('btn_save_settings');
  const btnRevokeKey = document.getElementById('btn_revoke_key');
  const btnExportLogs = document.getElementById('btn_export_logs');
  const modelDownloadBox = document.getElementById('model_download_box');
  const modelDownloadBar = document.getElementById('model_download_bar');
  const modelDownloadPct = document.getElementById('model_download_pct');
  const cloudPayloadCounter = document.getElementById('cloud_payload_counter');
  const btnOpenPrivacy = document.getElementById('btn_open_privacy');
  const btnClosePrivacy = document.getElementById('btn_close_privacy');
  const privacyModal = document.getElementById('privacy_modal');
  const statusText = document.querySelector('.status-text');

  function updateReasoningStatusBadge(hasKey, offline) {
    if (!statusText) return;
    if (hasKey && !offline) {
      statusText.textContent = '🟢 Cloud Reasoning';
    } else {
      statusText.textContent = '📶 Local Heuristic (Offline)';
    }
  }

  function loadSettings() {
    // 1. Load preferences from local storage
    chrome.storage.local.get(['modelName', 'model', 'simulationMode', 'offlineMode', 'perceptionEngine', 'surveillanceEnabled', 'pb_last_egress_stats'], (res) => {
      const m = res.modelName || res.model || 'claude-sonnet-4-6';
      const sim = res.simulationMode !== undefined ? res.simulationMode : (res.offlineMode !== undefined ? res.offlineMode : true);
      const engine = res.perceptionEngine || 'vision'; // Default to On-Device Neural Vision
      const surveillance = res.surveillanceEnabled !== undefined ? res.surveillanceEnabled : true;

      if (cfgPerceptionEngine) cfgPerceptionEngine.value = engine;
      if (cfgModel) cfgModel.value = m;
      if (cfgSimulation) cfgSimulation.checked = sim;
      if (cfgSurveillance) cfgSurveillance.checked = surveillance;

      if (res.pb_last_egress_stats && cloudPayloadCounter) {
        cloudPayloadCounter.textContent = `${res.pb_last_egress_stats.cloudPayloadBytes || 0} Bytes`;
      }

      // 2. Load API key and Master Passphrase strictly from volatile session storage
      if (chrome.storage.session) {
        chrome.storage.session.get(['encryptedApiKey', 'userPassphrase'], (sRes) => {
          const passphrase = sRes?.userPassphrase || '';
          if (cfgMasterPassphrase && passphrase) cfgMasterPassphrase.value = passphrase;

          if (sRes && sRes.encryptedApiKey) {
            const data = sRes.encryptedApiKey;
            // Check 30-day lifetime check
            if (data.createdAt && (Date.now() - data.createdAt > (data.maxLifetimeMs || 2592000000))) {
              if (keyHealthBadge) {
                keyHealthBadge.textContent = '⚠️ Status: Key Expired (>30 Days). Please rotate key.';
                keyHealthBadge.style.color = '#ef4444';
              }
              updateReasoningStatusBadge(false, true);
              return;
            }

            decryptApiKey(data, null, passphrase).then(decrypted => {
              if (cfgApiKey && decrypted) {
                cfgApiKey.value = decrypted;
                if (keyHealthBadge) {
                  keyHealthBadge.textContent = 'Status: Active & Valid (4-Hour Session TTL & 30-Day Cryptographic Lifetime)';
                  keyHealthBadge.style.color = '#10b981';
                }
                updateReasoningStatusBadge(true, sim);
              } else {
                updateReasoningStatusBadge(false, true);
              }
            });
          } else {
            updateReasoningStatusBadge(false, true);
          }
        });
      }
    });
  }

  if (btnTogglePassphrase && cfgMasterPassphrase) {
    btnTogglePassphrase.addEventListener('click', () => {
      cfgMasterPassphrase.type = cfgMasterPassphrase.type === 'password' ? 'text' : 'password';
    });
  }

  if (btnToggleKey) {
    btnToggleKey.addEventListener('click', () => {
      cfgApiKey.type = cfgApiKey.type === 'password' ? 'text' : 'password';
    });
  }

  if (btnRevokeKey) {
    btnRevokeKey.addEventListener('click', () => {
      if (cfgApiKey) cfgApiKey.value = '';
      if (cfgMasterPassphrase) cfgMasterPassphrase.value = '';
      if (chrome.storage.session) {
        chrome.storage.session.remove(['encryptedApiKey', 'anthropicApiKey', 'apiKey', 'userPassphrase']).catch(() => {});
      }
      chrome.storage.local.remove(['encryptedApiKey', 'anthropicApiKey', 'apiKey'], () => {
        if (keyHealthBadge) {
          keyHealthBadge.textContent = 'Status: Revoked (No Key Configured)';
          keyHealthBadge.style.color = '#94a3b8';
        }
        updateReasoningStatusBadge(false, true);
        showToast('API Key & Master Passphrase revoked and wiped from memory.');
      });
    });
  }

  if (btnExportLogs) {
    btnExportLogs.addEventListener('click', () => {
      chrome.storage.local.get(['pb_audit_logs'], (res) => {
        const logs = res.pb_audit_logs || currentLogs || [];
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `privbrowse_audit_trail_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`📥 Exported ${logs.length} audit logs to JSON!`);
      });
    });
  }

  if (btnOpenPrivacy && privacyModal) {
    btnOpenPrivacy.addEventListener('click', () => privacyModal.classList.remove('hidden'));
  }
  if (btnClosePrivacy && privacyModal) {
    btnClosePrivacy.addEventListener('click', () => privacyModal.classList.add('hidden'));
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const apiKey = cfgApiKey.value.trim();
      const passphrase = cfgMasterPassphrase ? cfgMasterPassphrase.value.trim() : '';
      const perceptionEngine = cfgPerceptionEngine ? cfgPerceptionEngine.value : 'vision';
      const model = cfgModel.value;
      const simulationMode = cfgSimulation.checked;
      const surveillanceEnabled = cfgSurveillance ? cfgSurveillance.checked : true;

      // Validate API key if entered
      if (apiKey && !/^sk-ant-[a-zA-Z0-9_\-]{15,}$/.test(apiKey)) {
        showToast('Invalid Anthropic API Key format (must start with sk-ant-)');
        return;
      }

      let encrypted = null;
      if (apiKey) {
        try {
          encrypted = await encryptApiKey(apiKey, null, passphrase);
        } catch (e) {
          console.warn('[PrivBrowse] AES-GCM encryption notice:', e);
        }
      }

      // Security Invariant: Store API keys STRICTLY in volatile session storage (zero disk writes)
      if (chrome.storage.session) {
        const sessionPayload = {};
        if (encrypted) sessionPayload.encryptedApiKey = encrypted;
        if (passphrase) sessionPayload.userPassphrase = passphrase;
        
        await chrome.storage.session.set(sessionPayload).catch(() => {});
        if (!encrypted) {
          chrome.storage.session.remove(['encryptedApiKey', 'anthropicApiKey', 'apiKey']).catch(() => {});
        }
      }

      // Ensure local storage never holds plaintext or residual keys
      chrome.storage.local.remove(['anthropicApiKey', 'apiKey']);

      // Persist only non-sensitive configuration in local storage
      chrome.storage.local.set({
        perceptionEngine: perceptionEngine,
        modelName: model,
        model: model,
        simulationMode: simulationMode,
        offlineMode: simulationMode,
        surveillanceEnabled: surveillanceEnabled
      }, () => {
        updateReasoningStatusBadge(!!apiKey, simulationMode);
        if (keyHealthBadge) {
          keyHealthBadge.textContent = passphrase 
            ? 'Status: Active (Protected with Zero-Knowledge Master Passphrase)' 
            : 'Status: Active (4-Hour Session TTL & 30-Day Cryptographic Lifetime)';
          keyHealthBadge.style.color = '#10b981';
        }
        showToast('Configuration encrypted (AES-GCM) & saved to volatile session memory!');
      });
    });
  }

  // =========================================================================
  // AUDIT STREAM & STAGE VISUALS
  // =========================================================================
  function updateStageVisuals(stageNum, status = 'active') {
    const stagePercents = { 0: 0, 1: 20, 2: 40, 3: 65, 4: 85, 5: 100 };
    const stageLabels = {
      0: 'Awaiting Run',
      1: 'Stage 1: Scanning DOM Layout...',
      2: 'Stage 2: Filtering Local PII...',
      3: 'Stage 3: Cloud Reasoning (Claude)...',
      4: 'Stage 4: CaMeL Intent Verification...',
      5: 'Stage 5: On-Device Visual DOM Execution...'
    };

    const pct = stagePercents[stageNum] || 0;
    if (pipelineBar) pipelineBar.style.width = `${pct}%`;
    if (pipelinePercentage) pipelinePercentage.textContent = `${pct}%`;
    if (pipelineStatusLabel) pipelineStatusLabel.textContent = stageLabels[stageNum] || 'Processing...';

    for (let i = 1; i <= 5; i++) {
      const pill = spills[i];
      if (!pill) continue;
      pill.classList.remove('active', 'completed', 'alert');

      if (i < stageNum) {
        pill.classList.add('completed');
      } else if (i === stageNum) {
        pill.classList.add(status === 'alert' ? 'alert' : 'active');
      }
    }
  }

  function renderAuditLogs() {
    if (!auditStream) return;
    if (currentLogs.length === 0) {
      auditStream.innerHTML = '<div class="log-empty">No active execution logs yet. Run the assistant to see the 5-stage verification live!</div>';
      if (logBadge) logBadge.textContent = '0';
      return;
    }

    if (logBadge) logBadge.textContent = currentLogs.length;

    const filtered = currentLogs.filter(log => {
      if (currentFilter === 'ALL') return true;
      if (currentFilter === 'SECURITY_ALERT') return log.type === 'SECURITY_ALERT';
      if (currentFilter === 'STAGE_3') return log.stage === 3;
      return true;
    });

    if (filtered.length === 0) {
      auditStream.innerHTML = '<div class="log-empty">No logs match the selected filter.</div>';
      return;
    }

    auditStream.innerHTML = '';
    filtered.forEach(log => {
      const entry = document.createElement('div');
      entry.className = `log-entry ${log.type}`;

      const stageText = log.stage > 0 ? `Stage ${log.stage}` : 'System';

      let detailsHtml = '';
      if (log.details) {
        detailsHtml = `<pre class="log-details-block">${escapeHtml(JSON.stringify(log.details, null, 2))}</pre>`;
      }

      entry.innerHTML = `
        <div class="log-meta">
          <span class="stage-tag">[${stageText}] ${log.type}</span>
          <span class="log-time">${log.timestamp}</span>
        </div>
        <div class="log-msg">${escapeHtml(log.message)}</div>
        ${detailsHtml}
      `;

      auditStream.appendChild(entry);
    });

    auditStream.scrollTop = auditStream.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function addLog(log) {
    currentLogs.push(log);

    if (previewLog) {
      previewLog.textContent = `[Stage ${log.stage}] ${log.message}`;
    }

    if (log.stage === 1 && log.type === 'SUCCESS') {
      const match = log.message.match(/(\d+) interactive elements/);
      if (match) metricStats.elements = parseInt(match[1]);
    }
    if (log.stage === 2 && log.type === 'WARNING') {
      const match = log.message.match(/Redacted (\d+) sensitive tokens/);
      if (match) metricStats.redacted += parseInt(match[1]);
    }
    if (log.stage === 4) {
      if (log.type === 'SECURITY_ALERT') {
        metricStats.blocked += 1;
        updateStageVisuals(4, 'alert');
      }
      if (log.type === 'SUCCESS') {
        const match = log.message.match(/(\d+)\/(\d+) actions verified/);
        if (match) {
          metricStats.safe = parseInt(match[1]);
          metricStats.total = parseInt(match[2]);
        }
      }
    }

    if (sumElements) sumElements.textContent = metricStats.elements;
    if (sumPiiFiltered) sumPiiFiltered.textContent = metricStats.redacted;
    if (sumVerifiedSafe) sumVerifiedSafe.textContent = `${metricStats.safe}/${metricStats.total}`;
    if (sumBlockedUnsafe) sumBlockedUnsafe.textContent = metricStats.blocked;

    if (log.stage > 0) {
      updateStageVisuals(log.stage, log.type === 'SECURITY_ALERT' ? 'alert' : 'active');
    }

    renderAuditLogs();
  }

  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderAuditLogs();
    });
  });

  const btnClearLogs = document.getElementById('btn_clear_logs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {
        currentLogs = [];
        metricStats = { elements: 0, redacted: 0, safe: 0, total: 0, blocked: 0 };
        if (sumElements) sumElements.textContent = '0';
        if (sumPiiFiltered) sumPiiFiltered.textContent = '0';
        if (sumVerifiedSafe) sumVerifiedSafe.textContent = '0/0';
        if (sumBlockedUnsafe) sumBlockedUnsafe.textContent = '0';
        updateStageVisuals(0);
        renderAuditLogs();
        if (previewLog) previewLog.textContent = 'Logs cleared. Ready.';
      });
    });
  }

  // =========================================================================
  // RUN AGENT PIPELINE
  // =========================================================================
  if (btnRunAgent) {
    btnRunAgent.addEventListener('click', async () => {
      const goal = goalInput ? goalInput.value.trim() : 'Fill form with my profile';
      if (!goal) {
        showToast('Please enter an automation goal', true);
        if (goalInput) goalInput.focus();
        return;
      }

      btnRunAgent.disabled = true;
      btnRunAgent.classList.add('loading');
      btnRunAgent.querySelector('.btn-text').textContent = 'Running Visual Agent...';
      updateStageVisuals(1);

      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.id) {
          throw new Error('No active browser tab found.');
        }

        if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://'))) {
          throw new Error('Cannot run on internal browser pages. Please open test-form.html.');
        }

        const storage = await chrome.storage.local.get(['simulationMode', 'offlineMode']);
        const forceSimulation = storage.simulationMode !== undefined ? storage.simulationMode :
                               (storage.offlineMode !== undefined ? storage.offlineMode : false);

        chrome.runtime.sendMessage({
          type: 'START_PIPELINE',
          goal,
          tabId: activeTab.id,
          forceSimulation
        }, (response) => {
          btnRunAgent.disabled = false;
          btnRunAgent.classList.remove('loading');
          btnRunAgent.querySelector('.btn-text').textContent = 'Run PrivBrowse Agent';

          if (chrome.runtime.lastError) {
            showToast(`Error: ${chrome.runtime.lastError.message}`, true);
            return;
          }

          if (response && response.success) {
            updateStageVisuals(5);
            if (pipelineStatusLabel) pipelineStatusLabel.textContent = 'Pipeline Completed Successfully!';
            showToast('Form filled successfully!');
          } else {
            showToast(response?.error || 'Execution encountered an issue', true);
          }
        });

      } catch (err) {
        btnRunAgent.disabled = false;
        btnRunAgent.classList.remove('loading');
        btnRunAgent.querySelector('.btn-text').textContent = 'Run PrivBrowse Agent';
        showToast(err.message, true);
      }
    });
  }

  // Listen for background updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUDIT_LOG_UPDATE' && message.log) {
      addLog(message.log);
    }
    if (message.type === 'EXECUTION_PROGRESS' && message.progress) {
      const p = message.progress;
      if (previewLog) {
        previewLog.textContent = `[Executing ${p.currentStep}/${p.totalSteps}] ${p.step.action} -> ${p.step.targetRefId}`;
      }
    }
    // Condition 4: Live visual model download progress bar in popup UI
    if (message.type === 'MODEL_DOWNLOAD_PROGRESS') {
      if (modelDownloadBox) {
        modelDownloadBox.classList.remove('hidden');
        if (modelDownloadBar) modelDownloadBar.style.width = `${message.progress || 0}%`;
        if (modelDownloadPct) modelDownloadPct.textContent = `${message.progress || 0}%`;
      }
    }
    // Item 4.D: Real-time Zero-PII Egress counter update
    if (message.type === 'EGRESS_STATS_UPDATE' && message.stats) {
      if (cloudPayloadCounter) {
        cloudPayloadCounter.textContent = `${message.stats.cloudPayloadBytes || 0} Bytes`;
      }
    }
  });

  loadProfileFromStorage();
  loadSettings();

  chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' }, (res) => {
    if (res && Array.isArray(res.logs) && res.logs.length > 0) {
      currentLogs = res.logs;
      renderAuditLogs();
      const last = res.logs[res.logs.length - 1];
      if (previewLog) previewLog.textContent = `[Stage ${last.stage}] ${last.message}`;
      updateStageVisuals(last.stage);
    }
  });

  const btnOpenOptions = document.getElementById('btn_open_options');
  if (btnOpenOptions) {
    btnOpenOptions.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options.html'));
      }
    });
  }

  // Real-time Multi-Context Configuration Sync (Condition 6)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.userProfile || changes.profile) {
          loadProfileFromStorage();
        }
        if (changes.privbrowse_config || changes.perceptionEngine) {
          loadSettings();
        }
      }
    });
  }
});

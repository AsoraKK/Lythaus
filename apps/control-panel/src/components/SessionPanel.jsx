import { useState } from 'react';
import {
  getAdminApiUrl,
  setAdminApiUrl
} from '../api/adminApi.js';
import LythButton from './LythButton.jsx';
import LythCard from './LythCard.jsx';
import LythInput from './LythInput.jsx';

function SessionPanel() {
  const [apiUrl, setApiUrl] = useState(getAdminApiUrl());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setAdminApiUrl(apiUrl);
    setApiUrl(getAdminApiUrl());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const handleClear = () => {
    setAdminApiUrl('');
    setApiUrl(getAdminApiUrl());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <LythCard variant="panel">
      <div className="panel-header">
        <h2>Admin connection</h2>
        <p>Cloudflare Access authenticates this browser before the admin API accepts an operation.</p>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Admin API base URL</span>
          <LythInput
            type="text"
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            placeholder="https://admin-api.lythaus.co/api"
          />
        </label>
      </div>
      <div className="panel-actions">
        <LythButton type="button" onClick={handleSave}>
          Save API override
        </LythButton>
        <LythButton variant="ghost" type="button" onClick={handleClear}>
          Use production API
        </LythButton>
        <span
          className={saved ? 'saved-indicator show' : 'saved-indicator'}
          aria-live="polite"
        >
          Saved
        </span>
      </div>
      <p className="panel-hint">
        Requests use credentialed CORS to the exact configured API origin. No
        administrator token is stored by this application.
      </p>
    </LythCard>
  );
}

export default SessionPanel;

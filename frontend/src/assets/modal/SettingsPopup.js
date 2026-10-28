import React from 'react';
import './SettingsPopup.css';

const SettingsPopup = ({
  temperature,
  setTemperature,
  topP,
  setTopP,
  frequencyPenalty,
  setFrequencyPenalty,
  presencePenalty,
  setPresencePenalty,
  toggleSettings,
}) => {
  return (
    <>
    <div className="settings-overlay" onClick={toggleSettings}></div>

    <div id="settings-popup" className="settings-popup">
      <div className="settings-header">
        <h4>AI Settings</h4>
        <button id="close-settings" className="close-settings" onClick={toggleSettings}>
          &times;
        </button>
      </div>
      <div className="settings-body">
        <label htmlFor="temperature">Temperature:</label>
        <input
          type="number"
          id="temperature"
          min="0"
          max="1"
          step="0.1"
          value={temperature}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (value >= 0 && value <= 1) {
              setTemperature(value); 
            } else if (value < 0) {
              setTemperature(0); 
            } else if (value > 1) {
              setTemperature(1);
            }
          }}
        />
        <label htmlFor="topP">Top P:</label>
        <input
          type="number"
          id="topP"
          min="0.1" 
          max="1"
          step="0.1"
          value={topP}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (value > 0.1 && value <= 1) {
              setTopP(value); 
            } else if (value <= 0.1) {
              setTopP(0.1); 
            } else if (value > 1) {
              setTopP(1); 
            }
          }}
        />
        <label htmlFor="frequencyPenalty">Frequency Penalty:</label>
        <input
          type="number"
          id="frequencyPenalty"
          min="0"
          max="2"
          step="0.1"
          value={frequencyPenalty}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (value >= 0 && value <= 2) {
              setFrequencyPenalty(value); 
            } else if (value < 0) {
              setFrequencyPenalty(0); 
            } else if (value > 2) {
              setFrequencyPenalty(2); 
            }
          }}
        />
        <label htmlFor="presencePenalty">Presence Penalty:</label>
        <input
          type="number"
          id="presencePenalty"
          min="-2" 
          max="2"  
          step="0.1"
          value={presencePenalty}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (value >= -2 && value <= 2) {
              setPresencePenalty(value); 
            } else if (value < -2) {
              setPresencePenalty(-2); 
            } else if (value > 2) {
              setPresencePenalty(2); 
            }
          }}
        />
      </div>
    </div>
    </>
  );
};

export default SettingsPopup;
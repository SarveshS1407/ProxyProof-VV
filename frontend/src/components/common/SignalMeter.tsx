import React from 'react';

interface SignalMeterProps {
  rssi: number;
  minRssi?: number;
  showText?: boolean;
}

export const SignalMeter: React.FC<SignalMeterProps> = ({ rssi, minRssi = -85, showText = true }) => {
  const isWithinRange = rssi >= minRssi;

  let signalClass = 'signal-weak';
  let qualityLabel = 'Weak / Out of Range';

  if (rssi >= -65) {
    signalClass = 'signal-strong';
    qualityLabel = 'Excellent (Immediate)';
  } else if (rssi >= minRssi) {
    signalClass = 'signal-medium';
    qualityLabel = 'Good (Within Classroom)';
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <div className={`signal-bars ${signalClass}`} title={`Signal Strength: ${rssi} dBm (Threshold: ${minRssi} dBm)`}>
        <div className="signal-bar" />
        <div className="signal-bar" />
        <div className="signal-bar" />
        <div className="signal-bar" />
      </div>

      {showText && (
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isWithinRange ? '#059669' : '#e11d48' }}>
          {rssi} dBm ({qualityLabel})
        </span>
      )}
    </div>
  );
};

import React from 'react';
import { CheckCircle2, Clock, ShieldCheck, AlertCircle, XCircle } from 'lucide-react';

interface StatusPillProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, size = 'md' }) => {
  const norm = status.toUpperCase();

  let badgeClass = 'badge-revoked';
  let icon = null;
  let label = status;

  switch (norm) {
    case 'PRESENT':
      badgeClass = 'badge-present';
      icon = <CheckCircle2 size={12} />;
      label = 'Present';
      break;
    case 'LATE':
      badgeClass = 'badge-late';
      icon = <Clock size={12} />;
      label = 'Late';
      break;
    case 'EXCUSED':
      badgeClass = 'badge-excused';
      icon = <ShieldCheck size={12} />;
      label = 'Excused';
      break;
    case 'ABSENT':
      badgeClass = 'badge-absent';
      icon = <XCircle size={12} />;
      label = 'Absent';
      break;
    case 'APPROVED':
      badgeClass = 'badge-approved';
      icon = <ShieldCheck size={12} />;
      label = 'Approved';
      break;
    case 'PENDING':
      badgeClass = 'badge-pending';
      icon = <Clock size={12} />;
      label = 'Pending Review';
      break;
    case 'REVOKED':
    case 'REJECTED':
      badgeClass = 'badge-revoked';
      icon = <XCircle size={12} />;
      label = norm === 'REJECTED' ? 'Rejected' : 'Revoked';
      break;
    case 'LIVE':
    case 'BROADCASTING':
      badgeClass = 'badge-present';
      icon = <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }} />;
      label = 'Live Beacon';
      break;
    case 'SCHEDULED':
      badgeClass = 'badge-pending';
      icon = <Clock size={12} />;
      label = 'Scheduled';
      break;
    case 'CONCLUDED':
    case 'CLOSED':
      badgeClass = 'badge-revoked';
      icon = <CheckCircle2 size={12} />;
      label = norm === 'CONCLUDED' ? 'Concluded' : 'Closed';
      break;
    case 'ACTIVE':
      badgeClass = 'badge-approved';
      icon = <CheckCircle2 size={12} />;
      label = 'Active';
      break;
    case 'SUSPENDED':
      badgeClass = 'badge-absent';
      icon = <XCircle size={12} />;
      label = 'Suspended';
      break;
    default:
      badgeClass = 'badge-revoked';
      label = status;
  }

  return (
    <span
      className={`badge ${badgeClass}`}
      style={{
        padding: size === 'sm' ? '0.15rem 0.5rem' : '0.2rem 0.625rem',
        fontSize: size === 'sm' ? '0.625rem' : '0.6875rem'
      }}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
};

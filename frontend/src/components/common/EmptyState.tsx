import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action }) => {
  return (
    <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '1rem', border: '1px dashed #cbd5e1' }}>
      <div style={{
        width: '3.25rem',
        height: '3.25rem',
        borderRadius: '50%',
        backgroundColor: '#f1f5f9',
        color: '#64748b',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1rem'
      }}>
        <Icon size={24} />
      </div>

      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.375rem' }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.8125rem', color: '#64748b', maxWidth: '360px', margin: '0 auto 1.25rem auto', lineHeight: 1.5 }}>
        {description}
      </p>

      {action && (
        <button onClick={action.onClick} className="btn btn-secondary btn-sm">
          {action.label}
        </button>
      )}
    </div>
  );
};

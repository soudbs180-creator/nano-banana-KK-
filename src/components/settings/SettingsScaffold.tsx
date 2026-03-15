import React, { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

type Tone = 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'neutral';
type IconLike = React.ComponentType<{ size?: number; className?: string }>;

const toneStyles: Record<Tone, { iconStyle: CSSProperties; badgeStyle: CSSProperties }> = {
  indigo: {
    iconStyle: {
      border: '1px solid var(--state-info-border)',
      background: 'var(--state-info-bg)',
      color: 'var(--state-info-text)',
    },
    badgeStyle: {
      borderColor: 'var(--state-info-border)',
      background: 'var(--state-info-bg)',
      color: 'var(--state-info-text)',
    },
  },
  emerald: {
    iconStyle: {
      border: '1px solid var(--state-success-border)',
      background: 'var(--state-success-bg)',
      color: 'var(--state-success-text)',
    },
    badgeStyle: {
      borderColor: 'var(--state-success-border)',
      background: 'var(--state-success-bg)',
      color: 'var(--state-success-text)',
    },
  },
  sky: {
    iconStyle: {
      border: '1px solid var(--state-info-border)',
      background: 'var(--state-info-bg)',
      color: 'var(--state-info-text)',
    },
    badgeStyle: {
      borderColor: 'var(--state-info-border)',
      background: 'var(--state-info-bg)',
      color: 'var(--state-info-text)',
    },
  },
  amber: {
    iconStyle: {
      border: '1px solid var(--state-warning-border)',
      background: 'var(--state-warning-bg)',
      color: 'var(--state-warning-text)',
    },
    badgeStyle: {
      borderColor: 'var(--state-warning-border)',
      background: 'var(--state-warning-bg)',
      color: 'var(--state-warning-text)',
    },
  },
  rose: {
    iconStyle: {
      border: '1px solid var(--state-danger-border)',
      background: 'var(--state-danger-bg)',
      color: 'var(--state-danger-text)',
    },
    badgeStyle: {
      borderColor: 'var(--state-danger-border)',
      background: 'var(--state-danger-bg)',
      color: 'var(--state-danger-text)',
    },
  },
  slate: {
    iconStyle: {
      border: '1px solid var(--border-light)',
      background: 'var(--bg-overlay)',
      color: 'var(--text-secondary)',
    },
    badgeStyle: {
      borderColor: 'var(--border-light)',
      background: 'var(--bg-overlay)',
      color: 'var(--text-secondary)',
    },
  },
  neutral: {
    iconStyle: {
      border: '1px solid var(--border-light)',
      background: 'var(--bg-overlay)',
      color: 'var(--text-secondary)',
    },
    badgeStyle: {
      borderColor: 'var(--border-light)',
      background: 'var(--bg-overlay)',
      color: 'var(--text-secondary)',
    },
  },
};

const buttonToneStyles: Record<'secondary' | 'primary' | 'danger', CSSProperties> = {
  secondary: {
    borderColor: 'var(--settings-button-secondary-border)',
    backgroundColor: 'var(--settings-button-secondary-bg)',
    color: 'var(--settings-button-secondary-text)',
  },
  primary: {
    borderColor: 'transparent',
    background: 'var(--settings-button-primary-bg)',
    color: 'var(--settings-button-primary-text)',
    boxShadow: 'var(--settings-button-primary-shadow)',
  },
  danger: {
    borderColor: 'var(--settings-button-danger-border)',
    backgroundColor: 'var(--settings-button-danger-bg)',
    color: 'var(--settings-button-danger-text)',
  },
};

export const SETTINGS_PANEL_STYLE = {
  borderColor: 'var(--settings-border-subtle)',
  backgroundColor: 'var(--settings-section-bg)',
} as const;

export const SETTINGS_ELEVATED_STYLE = {
  borderColor: 'var(--settings-border-subtle)',
  backgroundColor: 'var(--settings-surface-elevated)',
} as const;

export const SETTINGS_OVERLAY_STYLE = {
  borderColor: 'var(--settings-border-subtle)',
  backgroundColor: 'var(--settings-surface-overlay)',
} as const;

export const SETTINGS_SUCCESS_STYLE = {
  borderColor: 'var(--state-success-border)',
  backgroundColor: 'var(--state-success-bg)',
} as const;

export const SETTINGS_WARNING_STYLE = {
  borderColor: 'var(--state-warning-border)',
  backgroundColor: 'var(--state-warning-bg)',
} as const;

export const SETTINGS_DANGER_STYLE = {
  borderColor: 'var(--state-danger-border)',
  backgroundColor: 'var(--state-danger-bg)',
} as const;

export const SETTINGS_INPUT_CLASSNAME =
  'w-full rounded-xl border border-[var(--settings-input-border)] bg-[var(--settings-input-bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--settings-focus-border)] focus:ring-2 focus:ring-[var(--settings-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60';

export const SETTINGS_LABEL_CLASSNAME =
  'text-[11px] font-medium tracking-[0.03em] text-[var(--text-tertiary)]';

export const SettingsViewShell: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="space-y-4 md:space-y-5">{children}</div>
);

export const SettingsBadge: React.FC<{ children: ReactNode; tone?: Tone; className?: string }> = ({
  children,
  tone = 'neutral',
  className = '',
}) => (
  <span
    className={`inline-flex max-w-full min-w-0 items-center overflow-hidden rounded-full border px-2.5 py-1 text-left text-[11px] font-medium leading-[1.3] [overflow-wrap:anywhere] sm:text-center sm:whitespace-nowrap ${className}`.trim()}
    style={toneStyles[tone].badgeStyle}
  >
    {children}
  </span>
);

type SettingsHeroProps = {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  metrics?: ReactNode;
  icon?: IconLike;
  tone?: Tone;
};

export const SettingsHero: React.FC<SettingsHeroProps> = ({
  title,
  description,
  eyebrow,
  badge,
  actions,
  metrics,
  icon: Icon,
  tone = 'indigo',
}) => {
  const toneStyle = toneStyles[tone];

  return (
    <section className="apple-soft-card rounded-[20px] border p-5 md:p-6" style={SETTINGS_PANEL_STYLE}>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {Icon ? (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={toneStyle.iconStyle}>
                <Icon size={18} />
              </div>
            ) : null}

            <div className="min-w-0 flex-1 space-y-1.5">
              {eyebrow ? (
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                  {eyebrow}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 break-words text-lg font-semibold [overflow-wrap:anywhere] [text-wrap:balance] md:text-[1.45rem]" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h2>
                {badge}
              </div>

              <p className="max-w-3xl break-words text-sm leading-6 [overflow-wrap:anywhere]" style={{ color: 'var(--text-secondary)' }}>
                {description}
              </p>
            </div>
          </div>

          {actions ? <div className="flex max-w-full flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
        </div>

        {metrics ? <div className="grid auto-rows-fr gap-2.5 sm:grid-cols-2 xl:grid-cols-4">{metrics}</div> : null}
      </div>
    </section>
  );
};

type SettingsMetricCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  icon?: IconLike;
  tone?: Tone;
};

export const SettingsMetricCard: React.FC<SettingsMetricCardProps> = ({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'neutral',
}) => {
  const toneStyle = toneStyles[tone];

  return (
    <div className="h-full rounded-[18px] border p-4" style={SETTINGS_ELEVATED_STYLE}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
            {label}
          </div>
          <div className="mt-2 min-w-0 break-words text-base font-semibold leading-tight [font-variant-numeric:tabular-nums] [overflow-wrap:anywhere] [text-wrap:balance] md:text-lg" style={{ color: 'var(--text-primary)' }}>
            {value}
          </div>
          {helper ? (
            <div className="mt-2 break-words text-xs leading-5 [overflow-wrap:anywhere]" style={{ color: 'var(--text-tertiary)' }}>
              {helper}
            </div>
          ) : null}
        </div>

        {Icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={toneStyle.iconStyle}>
            <Icon size={16} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

type SettingsSectionProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
};

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  eyebrow,
  action,
  children,
}) => (
  <section
    className="apple-soft-card rounded-[20px] border p-5 md:p-6"
    style={SETTINGS_PANEL_STYLE}
  >
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
            {eyebrow}
          </div>
        ) : null}
        <h3 className="break-words text-base font-semibold [overflow-wrap:anywhere] [text-wrap:balance] md:text-lg" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {description ? (
          <p className="max-w-3xl break-words text-sm leading-6 [overflow-wrap:anywhere]" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        ) : null}
      </div>

      {action ? <div className="flex max-w-full flex-wrap items-center gap-2 md:justify-end">{action}</div> : null}
    </div>

    {children}
  </section>
);

type SettingsActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconLike;
  tone?: 'secondary' | 'primary' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export const SettingsActionButton: React.FC<SettingsActionButtonProps> = ({
  children,
  icon: Icon,
  tone = 'secondary',
  size = 'md',
  loading = false,
  type = 'button',
  style,
  className = '',
  ...buttonProps
}) => (
  <button
    type={type}
    className={`inline-flex max-w-full min-w-0 items-center justify-center gap-2 rounded-xl border text-center font-medium leading-tight transition duration-200 hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 [overflow-wrap:anywhere] sm:whitespace-nowrap ${size === 'sm' ? 'min-h-9 px-3 py-2 text-xs' : 'min-h-10 px-4 py-2 text-sm'} ${className}`.trim()}
    style={{ ...buttonToneStyles[tone], ...style }}
    {...buttonProps}
  >
    {Icon ? <Icon size={size === 'sm' ? 14 : 16} className={loading ? 'animate-spin' : undefined} /> : null}
    {children}
  </button>
);

type SettingsDangerZoneProps = {
  title: string;
  description: ReactNode;
  action?: ReactNode;
};

export const SettingsDangerZone: React.FC<SettingsDangerZoneProps> = ({
  title,
  description,
  action,
}) => (
  <div
    className="rounded-[18px] border p-4 md:p-5"
    style={{
      borderColor: 'var(--state-danger-border)',
      backgroundColor: 'var(--state-danger-bg)',
    }}
  >
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        <div className="mt-1 text-sm leading-6" style={{ color: 'var(--state-danger-muted)' }}>
          {description}
        </div>
      </div>
      {action ? <div className="flex max-w-full flex-wrap gap-2 md:justify-end">{action}</div> : null}
    </div>
  </div>
);

import clsx from 'clsx';
import { Link } from 'react-router';
import { LoaderCircle } from 'lucide-react';

/**
 * @param {{ variant?: 'default'|'primary'|'gold'|'danger'|'ghost'|'subtle', size?: 'sm'|'md'|'lg', icon?: import('react').ComponentType,
 *           loading?: boolean, block?: boolean, to?: string, iconOnly?: boolean } & import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({ variant = 'default', size = 'md', icon: Icon, loading = false, block = false, iconOnly = false, to, className, children, disabled, type = 'button', ...rest }) {
  const classes = clsx(
    'btn',
    variant !== 'default' && `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    iconOnly && 'btn--icon',
    block && 'btn--block',
    className,
  );
  const iconSize = size === 'sm' ? 15 : 17;
  const content = (
    <>
      {loading ? <LoaderCircle size={iconSize} className="btn__spinner" aria-hidden /> : Icon && <Icon size={iconSize} aria-hidden />}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }) {
  return <Button icon={icon} iconOnly aria-label={label} title={label} {...rest} />;
}

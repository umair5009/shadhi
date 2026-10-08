import { Fragment } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

/**
 * @param {{ title: import('react').ReactNode, subtitle?: import('react').ReactNode, actions?: import('react').ReactNode,
 *           breadcrumbs?: { label: string, to?: string }[] }} props
 */
export function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {breadcrumbs?.length > 0 && (
          <nav className="page-header__eyebrow" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={crumb.label}>
                {index > 0 && <ChevronRight size={14} aria-hidden />}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

import clsx from 'clsx';

export function Card({ className, children, as: Tag = 'section', ...rest }) {
  return (
    <Tag className={clsx('card', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, actions, plain = false, children }) {
  return (
    <div className={clsx('card__header', plain && 'card__header--plain')}>
      <div style={{ minWidth: 0 }}>
        {title && <h2 className="card__title">{title}</h2>}
        {subtitle && <p className="card__subtitle">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function CardBody({ flush = false, className, children }) {
  return <div className={clsx('card__body', flush && 'card__body--flush', className)}>{children}</div>;
}

export function CardFooter({ children }) {
  return <div className="card__footer">{children}</div>;
}

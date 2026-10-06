import LythCard from './LythCard.jsx';

function PageLayout({
  title,
  subtitle,
  children,
  headerActions = null,
  guide = {},
  className = '',
  headingLevel = 1
}) {
  const {
    title: guideTitle = 'What this page does',
    summary = '',
    items = [],
    footnote = ''
  } = guide;
  const Heading = headingLevel === 2 ? 'h2' : 'h1';

  return (
    <section className={['page', 'page--with-guide', className].filter(Boolean).join(' ')}>
      <div className="page-main">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <Heading>{title}</Heading>
              {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
            </div>
            {headerActions ? (
              <div className="page-header-actions">{headerActions}</div>
            ) : null}
          </div>
        </div>
        {children}
      </div>
      <aside className="page-guide" aria-label={`${title} instructions`}>
        <LythCard variant="panel" className="guide-card">
          <h2>{guideTitle}</h2>
          {summary ? <p className="guide-summary">{summary}</p> : null}
          {items.length ? (
            <ol className="guide-list">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : null}
          {footnote ? <p className="guide-footnote">{footnote}</p> : null}
        </LythCard>
      </aside>
    </section>
  );
}

export default PageLayout;

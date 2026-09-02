export default function ConsoleLoading() {
  return <main className="page-wrap console-loading" role="status" aria-label="正在加载后台页面">
    <div className="console-loading-heading" aria-hidden="true"><span /><i /></div>
    <div className="console-loading-grid" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <div className="console-loading-card" key={index}><span /><strong /><i /></div>)}</div>
    <div className="console-loading-panels" aria-hidden="true"><div /><div /></div>
  </main>;
}

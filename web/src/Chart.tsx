import { Activity, ArrowUpRight, Clock3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatPrice, type History } from './oracle';

export function Chart({ history, inverse, loading, hours }: { history?: History; inverse: boolean; loading: boolean; hours: number }) {
  const unit = inverse ? 'ETH per GEOM' : 'GEOM per ETH';
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(230, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [history?.state]);
  const convert = (p: number) => inverse ? 1 / p : p;
  if (!history || history.state !== 'ready') return <div className="chart-empty" aria-busy={loading}>
    <div className="empty-icon">{history?.state === 'error' ? <Activity size={28} /> : <Clock3 size={28} />}</div>
    <h3>{loading ? 'Reading the oracle…' : history?.state === 'short' ? 'Not enough history' : history?.state === 'error' ? 'History is unavailable' : 'Waiting for the oracle'}</h3>
    <p>{history?.state === 'short' ? `The buffer does not retain the full ${hours}-hour window. ${hours > 1 ? 'Try a shorter window or grow the buffer to retain more future observations.' : 'Grow the buffer to retain more future observations, then check again as history builds.'}` : history?.state === 'error' ? `${history.message} Refresh to try again.` : 'Prices will appear after the public RPC returns verified pool data.'}</p>
    {history?.state === 'short' && <a href="#buffer">Inspect the observation buffer <ArrowUpRight size={15} /></a>}
    <span className="empty-foot">Real observations only · No estimated history</span>
  </div>;
  const points = history.points.map(p => ({ ...p, standard: convert(p.standard), truncated: convert(p.truncated) }));
  const values = points.flatMap(p => [p.standard, p.truncated]);
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.16, hi * 0.0002);
  const min = Math.max(0, lo - pad), max = hi + pad;
  const y = (p: number) => 234 - (p - min) / (max - min) * 210;
  const x = (i: number) => 84 + i / (points.length - 1) * (width - 106);
  const path = (key: 'standard' | 'truncated') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
  return <>
    <div className="chart-wrap" ref={container}>
      <svg className="price-chart" viewBox={`0 0 ${width} 280`} role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">Standard and truncated TWAP over {hours} hours</title>
        <desc id="chart-desc">24 interval prices in {unit}. Full window standard: {formatPrice(convert(history.standard))}; truncated: {formatPrice(convert(history.truncated))}. Exact plotted values are available in the table below.</desc>
        {Array.from({ length: 5 }, (_, i) => { const v = min + (max - min) * i / 4; return <g key={i}><line x1="84" x2={width - 22} y1={y(v)} y2={y(v)} className="grid-line" /><text x="72" y={y(v) + 4} textAnchor="end">{formatPrice(v)}</text></g>; })}
        <path d={path('standard')} className="series standard" />
        <path d={path('truncated')} className="series truncated" />
        {(width < 420 ? [0, 12, 23] : [0, 6, 12, 18, 23]).map(i => <text key={i} x={x(i)} y="268" textAnchor="middle">{points[i].age === 0 ? 'Now' : `−${Number((points[i].age / 3600).toFixed(2))}h`}</text>)}
      </svg>
    </div>
    <p className="chart-note">Each point is a {history.seconds / 24 / 60}-minute TWAP. Summary prices use the entire {hours}-hour window.</p>
    <details className="data-details"><summary>View chart data <span>24 samples</span></summary><div className="table-scroll"><table><caption>Interval TWAPs · {unit}</caption><thead><tr><th scope="col">Interval ends</th><th scope="col">Standard</th><th scope="col">Truncated</th></tr></thead><tbody>{points.map(p => <tr key={p.age}><th scope="row">{p.age === 0 ? 'Now' : `${p.age / 60} min ago`}</th><td>{formatPrice(p.standard)}</td><td>{formatPrice(p.truncated)}</td></tr>)}</tbody></table></div></details>
  </>;
}

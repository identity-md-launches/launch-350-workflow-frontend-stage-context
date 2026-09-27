import { createRoot } from 'react-dom/client';
import './styles.css';
import { loadConfig } from './config';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<main className="startup"><div className="brand-mark">g</div><h1>Geomean oracle</h1><p role="status">Verifying deployment configuration…</p></main>);
loadConfig().then(c => root.render(<App c={c} />)).catch((e: Error) => root.render(<main className="startup"><h1>Unable to load the oracle</h1><p role="alert">{e.message}</p><button className="button" onClick={() => location.reload()}>Reload configuration</button></main>));

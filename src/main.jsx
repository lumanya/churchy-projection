import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';
import { onPhone } from './bridge.js';
import Operator from './operator/Operator.jsx';
import Output from './output/Output.jsx';
import Stage from './stage/Stage.jsx';
import Remote from './remote/Remote.jsx';
import Stream from './stream/Stream.jsx';

function App() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const h = () => setHash(window.location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  let view = 'operator';
  if (hash.startsWith('#/output')) view = 'output';
  else if (hash.startsWith('#/stage')) view = 'stage';
  else if (hash.startsWith('#/stream')) view = 'stream';
  else if (hash.startsWith('#/remote') || onPhone) view = 'remote';
  document.body.className = 'is-' + view;
  if (view === 'output') return <Output />;
  if (view === 'stage') return <Stage />;
  if (view === 'remote') return <Remote />;
  if (view === 'stream') return <Stream />;
  return <Operator />;
}

createRoot(document.getElementById('root')).render(<App />);

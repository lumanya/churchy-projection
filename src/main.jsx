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
import Operator from './operator/Operator.jsx';
import Output from './output/Output.jsx';

const isOutput = window.location.hash.startsWith('#/output');
document.body.classList.add(isOutput ? 'is-output' : 'is-operator');
createRoot(document.getElementById('root')).render(isOutput ? <Output /> : <Operator />);

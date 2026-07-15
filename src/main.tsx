import { render } from 'preact';
import { App } from './app/App';
import { initTheme } from './app/theme';
import './styles/app.css';

initTheme();
render(<App />, document.getElementById('app')!);

import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

/** Mounts the interface in the page's #app element. */
export function start(target: HTMLElement): void {
  target.textContent = '';
  mount(App, { target });
}

// Search locally available Git refs without conflating local and remote branch names.
export type Branch = {ref: string; name: string; kind: 'local' | 'remote'; current: boolean};
type Choice = Branch | {ref:'auto'; name:string; kind:'automatic'; current:false};
export function filterBranches(branches: Branch[], query: string): Choice[] {
  const text = query.trim().toLocaleLowerCase();
  return [{ref:'auto',name:'Auto base',kind:'automatic',current:false} as const, ...branches]
    .filter(branch => `${branch.name} ${branch.ref}`.toLocaleLowerCase().includes(text));
}
export function moveBranchIndex(index: number, key: string, count: number) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return key === 'ArrowUp' ? (index <= 0 ? count - 1 : index - 1) : (index + 1) % count;
}
export function createBranchPicker(onSelect: () => void) {
  const button = document.getElementById('compare-base') as HTMLButtonElement;
  const panel = document.getElementById('branch-picker-panel')!;
  const search = document.getElementById('branch-search') as HTMLInputElement;
  const list = document.getElementById('branch-options')!;
  const status = document.getElementById('branch-picker-status')!;
  const retry = document.getElementById('branch-picker-retry')!;
  const container = document.getElementById('branch-picker')!;
  let value = 'auto', branches: Branch[] = [], choices: Choice[] = [], active = -1;
  let generation = 0, loaded = false, loading = false, error = '';
  const opened = () => !panel.hidden;
  function paintSelection() {
    const selected = branches.find(branch => branch.ref === value);
    const missing = loaded && value !== 'auto' && !selected;
    button.textContent = value === 'auto' ? 'Auto base' : `${selected?.name || value}${missing ? ' (unavailable)' : ''}`;
    button.setAttribute('aria-label', `Comparison base: ${button.textContent}`);
    button.title = value === 'auto' ? 'Automatically compare against main or master' : value;
  }
  function paintActive() {
    const options = Array.from(list.children);
    options.forEach((option, index) => option.classList.toggle('is-active', index === active));
    if (active >= 0 && options[active]) {
      search.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({block:'nearest'});
    } else search.removeAttribute('aria-activedescendant');
  }
  function render() {
    choices = filterBranches(branches, search.value);
    list.replaceChildren();
    choices.forEach(choice => {
      const option = document.createElement('div');
      option.id = `branch-option-${encodeURIComponent(choice.ref)}`;
      option.setAttribute('role','option'); option.setAttribute('aria-selected',String(choice.ref === value));
      option.className = 'branch-option';
      const name = document.createElement('span'); name.className = 'branch-option-name'; name.textContent = choice.name;
      const tag = document.createElement('span'); tag.className = 'branch-option-tag';
      tag.textContent = choice.kind === 'automatic' ? 'main / master' : `${choice.kind === 'local' ? 'Local' : 'Remote'}${choice.current ? ' · Current' : ''}`;
      option.append(name,tag);
      // Keep focus on the combobox until click selection, including in browsers that blur on non-focusable options.
      option.addEventListener('pointerdown',event => event.preventDefault());
      option.addEventListener('click',() => select(choice.ref)); list.append(option);
    });
    active = choices.findIndex(choice => choice.ref === value);
    if (active < 0 && choices.length) active = 0;
    status.textContent = loading ? 'Loading branches…' : error || (!choices.length ? 'No matching branches.' : `${branches.length} branches available locally`);
    retry.hidden = !error; list.setAttribute('aria-busy',String(loading)); paintSelection(); paintActive();
  }
  function close(restoreFocus = false) {
    panel.hidden = true; button.setAttribute('aria-expanded','false'); search.setAttribute('aria-expanded','false');
    if (restoreFocus) button.focus();
  }
  function select(ref: string) { value = ref; paintSelection(); close(true); onSelect(); }
  async function refresh() {
    const request = ++generation; loading = true; error = ''; render();
    try {
      const response = await fetch('/branches');
      if (!response.ok) throw Error('Could not load branches. Retry to refresh the list.');
      const result = await response.json();
      if (request !== generation) return;
      if (!result.available) throw Error(result.message || 'Branches are unavailable for this repository.');
      if (!Array.isArray(result.branches) || result.branches.some((branch: Branch) => typeof branch.ref !== 'string' || typeof branch.name !== 'string' || !['local','remote'].includes(branch.kind))) throw Error('Could not read the branch list.');
      branches = result.branches; loaded = true;
    } catch (reason) { if (request === generation) error = reason instanceof Error ? reason.message : 'Could not load branches.'; }
    finally { if (request === generation) { loading = false; render(); } }
  }
  function open() {
    if (button.disabled) return;
    panel.hidden = false; button.setAttribute('aria-expanded','true'); search.setAttribute('aria-expanded','true');
    search.value = ''; render(); search.focus(); void refresh();
  }
  button.addEventListener('click',() => opened() ? close() : open());
  button.addEventListener('keydown',event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); open(); } });
  search.addEventListener('input',render);
  search.addEventListener('keydown',event => {
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); active = moveBranchIndex(active,event.key,choices.length); paintActive(); }
    else if (event.key === 'Enter') { event.preventDefault(); if (choices[active]) select(choices[active].ref); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') close();
  });
  retry.addEventListener('click',() => { search.focus(); void refresh(); });
  document.addEventListener('pointerdown',event => { if (!container.contains(event.target as Node)) close(); });
  container.addEventListener('focusout',event => { if (!container.contains(event.relatedTarget as Node)) close(); });
  return { get value() { return value; }, setEnabled(enabled: boolean) { button.disabled = !enabled; if (!enabled) close(); }, refresh };
}

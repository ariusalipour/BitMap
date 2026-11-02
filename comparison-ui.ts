// Branch comparison state and annotations; updating highlights never rebuilds the diagram.
export type ChangeReason = { kind: 'source' | 'evidence'; path: string; status: string; oldPath?: string };
type Comparison = { available: true; branch: string; base: string; files: unknown[]; nodes: {id: string; reasons: ChangeReason[]}[]; unmappedFiles: unknown[]; scope: 'committed' } | {available: false; message: string};
const statusLabel = (status: string) => ({ A:'Added', M:'Modified', D:'Deleted', R:'Renamed', C:'Copied', T:'Type changed', U:'Unmerged' }[status[0]] || status);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function createComparisonController(onChange: () => void) {
  const toggle = document.getElementById('compare-toggle')!;
  const base = document.getElementById('compare-base') as HTMLSelectElement;
  const refresh = document.getElementById('compare-refresh') as HTMLButtonElement;
  const strip = document.getElementById('comparison-strip')!;
  const status = document.getElementById('comparison-status')!;
  let enabled = false, loading = false, generation = 0;
  let result: Comparison | undefined;
  const reasons = (id: string) => enabled && result?.available ? result.nodes.find(n => n.id === id)?.reasons || [] : [];
  function paint() {
    toggle.setAttribute('aria-pressed', String(enabled));
    document.body.dataset.comparing = String(enabled);
    strip.hidden = !enabled;
    base.disabled = !enabled;
    refresh.hidden = !enabled;
    refresh.disabled = loading;
    refresh.textContent = result?.available === false ? 'Retry' : 'Refresh';
    if (loading) status.textContent = 'Comparing committed changes…';
    else if (result?.available) status.textContent = `${result.branch} → ${result.base} · ${result.files.length} changed files · ${result.nodes.length} affected components · ${result.unmappedFiles.length} unmapped files${result.files.length ? '' : ' · No committed changes'}`;
    else status.textContent = result?.message || '';
    onChange();
  }
  async function load() {
    const request = ++generation;
    loading = true; result = undefined; paint();
    try {
      const response = await fetch(`/comparison?base=${encodeURIComponent(base.value)}`);
      if (!response.ok) throw Error('Could not load the comparison. Try again.');
      const value = await response.json() as Comparison;
      if (request !== generation || !enabled) return;
      result = value;
    } catch (error) {
      if (request !== generation || !enabled) return;
      result = {available:false,message:error instanceof Error ? error.message : 'Could not load the comparison. Try again.'};
    } finally { if (request === generation) { loading = false; paint(); } }
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    if (enabled) void load();
    else { generation++; loading = false; result = undefined; paint(); }
  });
  base.addEventListener('change', () => { if (enabled) void load(); });
  refresh.addEventListener('click', () => { if (enabled) void load(); });
  return {
    reasons,
    annotate(svg?: SVGSVGElement) {
      for (const element of document.querySelectorAll<HTMLElement>('.component[data-id]')) {
        const changes = reasons(element.dataset.id!);
        element.dataset.change = changes.length ? changes.some(r => r.kind === 'source') ? 'source' : 'evidence' : '';
        element.querySelector('.change-badge')?.remove();
        if (changes.length) {
          const badge = document.createElement('span'); badge.className = 'change-badge';
          badge.textContent = element.dataset.change === 'source' ? 'Changed' : 'Evidence'; element.append(badge);
        }
      }
      if (!svg) return;
      for (const node of svg.querySelectorAll<SVGGElement>('.node[data-component-id]')) {
        const changes = reasons(node.dataset.componentId!);
        node.classList.toggle('change-source', changes.some(r => r.kind === 'source'));
        node.classList.toggle('change-evidence', changes.length > 0 && !changes.some(r => r.kind === 'source'));
        node.querySelector('[data-change-label]')?.remove();
        if (!changes.length) { node.setAttribute('aria-label', node.dataset.componentLabel!); continue; }
        const label = changes.some(r => r.kind === 'source') ? 'Changed' : 'Evidence';
        node.setAttribute('aria-label', `${node.dataset.componentLabel}, ${label.toLowerCase()}`);
        const shape = node.querySelector<SVGGraphicsElement>('rect,polygon,path,circle,ellipse');
        if (!shape) continue;
        const box = shape.getBBox();
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badge.setAttribute('data-change-label', ''); badge.setAttribute('x', String(box.x + box.width - 2)); badge.setAttribute('y', String(box.y - 5));
        badge.setAttribute('text-anchor', 'end'); badge.setAttribute('font-size', '10'); badge.setAttribute('font-weight', '600'); badge.textContent = label;
        node.append(badge);
      }
    },
    inspector(id: string | null) {
      const changes = id ? reasons(id) : [];
      return changes.length ? `<section class="change-reasons"><h4>Branch changes</h4><p>Direct source or connection evidence changes; no transitive impact inferred.</p><ul>${changes.map(r => `<li><strong>${r.kind === 'source' ? 'Source' : 'Connection evidence'} · ${esc(statusLabel(r.status))}</strong><code>${r.oldPath ? `${esc(r.oldPath)} → ` : ''}${esc(r.path)}</code></li>`).join('')}</ul></section>` : '';
    },
  };
}

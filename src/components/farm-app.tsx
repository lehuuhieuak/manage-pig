'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Batch, Entry, Farm, Mutation, Snapshot } from '@/lib/types';
import { batchTotals, dateLabel, kindLabel, money } from '@/lib/format';
import { EditForm, type Editor } from './forms';
import Report from './report';

export class SaveError extends Error { constructor(message: string, public code?: string) { super(message); } }
export type RunMutation = (action: Mutation['action'], data: Record<string, unknown>, requestId: string) => Promise<Snapshot | null>;

export default function FarmApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'home' | 'farm' | 'batch' | 'report'>('home');
  const [farmId, setFarmId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'Farm' | 'Batch' | 'Entry'; item: Farm | Batch | Entry } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteRequest = useRef('');
  const deleteGuard = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/data', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Chưa tải được dữ liệu. Vui lòng thử lại.');
    setSnapshot(body as Snapshot); setError('');
    return body as Snapshot;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/data', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Chưa tải được dữ liệu. Vui lòng thử lại.');
      setSnapshot(body as Snapshot);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const run: RunMutation = async (action, data, requestId) => {
    let response: Response;
    try { response = await fetch('/api/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data, requestId }) }); }
    catch { throw new SaveError('Chưa xác nhận được đã lưu. Kiểm tra mạng rồi bấm Lưu lại; ứng dụng sẽ chống ghi trùng.', 'UNCERTAIN'); }
    let body;
    try { body = await response.json(); } catch { throw new SaveError('Máy chủ chưa trả kết quả rõ ràng. Vui lòng thử lưu lại.', 'UNCERTAIN'); }
    if (!response.ok) throw new SaveError(body.error || 'Chưa lưu được. Vui lòng thử lại.', response.status >= 500 ? 'UNCERTAIN' : body.code || (response.status === 409 ? 'CONFLICT' : undefined));
    setNotice('Đã lưu thành công.');
    try { return await refresh(); }
    catch { setError('Đã lưu trên máy chủ, nhưng chưa tải được dữ liệu mới. Bấm Tải lại để cập nhật.'); return null; }
  };
  function openFarm(farm: Farm) { setFarmId(farm.id); setView('farm'); setNotice(''); }
  function openBatch(batch: Batch) { setBatchId(batch.id); setFarmId(batch.farmId); setView('batch'); setNotice(''); }
  function edit(value: Editor) { setEditor(value); setEditorKey(k => k + 1); setNotice(''); }
  const farm = snapshot?.farms.find(f => f.id === farmId);
  const batch = snapshot?.batches.find(b => b.id === batchId);
  function requestDelete(type: 'Farm' | 'Batch' | 'Entry', item: Farm | Batch | Entry) { deleteRequest.current = crypto.randomUUID(); setDeleteError(''); setDeleteTarget({ type, item }); }
  async function confirmDelete() {
    if (!deleteTarget || deleteGuard.current) return;
    deleteGuard.current = true; setDeleting(true);
    try {
      await run(`delete${deleteTarget.type}`, { id: deleteTarget.item.id, version: deleteTarget.item.version }, deleteRequest.current);
      if (deleteTarget.type === 'Farm') setView('home');
      if (deleteTarget.type === 'Batch') setView('farm');
      setDeleteTarget(null);
    } catch (e) { setDeleteError((e as Error).message); }
    finally { deleteGuard.current = false; setDeleting(false); }
  }
  async function reloadEditor(selectedMonth?: string) {
    try {
      const fresh = await refresh();
      if (editor?.type === 'entry' && editor.kind === 'labor' && selectedMonth) {
        const existing = fresh.entries.find(e => e.batchId === editor.batch.id && e.kind === 'labor' && e.month === selectedMonth);
        const original = editor.entry ? fresh.entries.find(e => e.id === editor.entry?.id) : undefined;
        const currentBatch = fresh.batches.find(b => b.id === editor.batch.id);
        if (!currentBatch) { setEditor(null); return; }
        setEditor({ ...editor, batch: currentBatch, entry: existing || original, month: selectedMonth });
      } else if (editor?.type === 'batch' && !editor.batch && fresh.batches.some(b => b.farmId === editor.farmId && !b.endDate)) {
        setEditor(null); setNotice('Trại đã có đợt đang nuôi trên máy khác. Dữ liệu đã được cập nhật.');
      } else if (editor && 'entry' in editor && editor.entry) {
        const current = fresh.entries.find(e => e.id === editor.entry?.id);
        if (!current) { setEditor(null); setNotice('Khoản này đã được xóa trên máy khác.'); return; }
        setEditor({ ...editor, entry: current });
      } else if (editor && 'batch' in editor && editor.batch) {
        const current = fresh.batches.find(b => b.id === editor.batch?.id);
        if (!current) { setEditor(null); return; }
        setEditor({ ...editor, batch: current });
      }
      setEditorKey(k => k + 1);
    } catch (e) { setError((e as Error).message); }
  }
  function actions(target: Batch) {
    return <div className="quick-actions">{(['feed', 'sale', 'labor', 'other'] as const).map(kind => <button key={kind} className={`action action-${kind}`} onClick={() => edit({ type: 'entry', kind, batch: target })}><span aria-hidden="true">{{ feed: '▤', sale: '↗', labor: '◷', other: '＋' }[kind]}</span>{kindLabel[kind]}</button>)}</div>;
  }
  function batchCard(target: Batch) {
    const totals = batchTotals(target, snapshot!.entries);
    return <button className="batch-card" key={target.id} onClick={() => openBatch(target)}><span className="row spread"><strong>{target.name}</strong><span aria-hidden="true">→</span></span><span className="muted">{dateLabel(target.startDate)}{target.endDate ? ` – ${dateLabel(target.endDate)}` : ` · ${target.pigCount} con heo giống`}</span><span className="row spread"><span>{target.endDate ? 'Lời / lỗ' : 'Thu − chi tạm tính'}</span><strong className={totals.profit.isNegative() ? 'negative' : 'positive'}>{money(totals.profit)}</strong></span></button>;
  }
  return <>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => setView('home')} aria-label="Sổ trại nhà, về trang chủ"><span className="brand-mark" aria-hidden="true">S</span><span>Sổ trại nhà<small>Ghi chép hôm nay, an tâm ngày mai</small></span></button><span className="family-label">Sổ của gia đình</span></div></header>
    <main className="shell">
      <nav className="tabs" aria-label="Điều hướng chính"><button aria-current={view !== 'report' ? 'page' : undefined} onClick={() => setView('home')}>Các trại</button><button aria-current={view === 'report' ? 'page' : undefined} onClick={() => { setView('report'); setNotice(''); }}>Bảng tổng hợp</button></nav>
      {notice ? <div className="notice" role="status">✓ {notice}</div> : null}
      {error ? <div className="error" role="alert"><p>{error}</p><button className="secondary" onClick={() => { setLoading(true); refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>Tải lại dữ liệu</button></div> : null}
      {loading && !snapshot ? <div className="empty" role="status">Đang mở sổ của gia đình…</div> : null}
      {!loading && !snapshot ? <div className="empty"><span className="empty-icon" aria-hidden="true">▥</span><h1>Chưa mở được sổ</h1><p>Cần có mạng và kết nối máy chủ để xem, ghi thu chi.</p></div> : null}
      {snapshot && view === 'home' ? <>
        <div className="page-heading"><div><p className="eyebrow">CÙNG CHĂM TRẠI NHÀ</p><h1>Các trại của gia đình</h1><p className="muted">Chọn một trại để ghi thu chi hôm nay.</p></div><button className="primary" onClick={() => edit({ type: 'farm' })}>＋ Thêm trại</button></div>
        <div className="overview"><div><span>Trại đang quản lý</span><strong>{snapshot.farms.length}</strong></div><div><span>Đợt đang nuôi</span><strong>{snapshot.batches.filter(b => !b.endDate).length}</strong></div><div><span>Đợt đã kết thúc</span><strong>{snapshot.batches.filter(b => b.endDate).length}</strong></div></div>
        {snapshot.farms.length ? <div className="farm-grid">{snapshot.farms.map(f => { const active = snapshot.batches.find(b => b.farmId === f.id && !b.endDate); const total = active ? batchTotals(active, snapshot.entries) : null; return <button className="farm-card" key={f.id} onClick={() => openFarm(f)}><span className="row spread"><span className="farm-symbol" aria-hidden="true">⌂</span><span className={`badge ${active ? '' : 'quiet'}`}>{active ? 'Đang nuôi' : 'Chưa có đợt mới'}</span></span><h2>{f.name}</h2><p className="muted">{active?.name || 'Sẵn sàng cho đợt nuôi tiếp theo'}</p><div className="farm-card-bottom"><span>{active ? 'Thu − chi tạm tính' : 'Mở sổ trại'}</span>{total ? <strong className={total.profit.isNegative() ? 'negative' : 'positive'}>{money(total.profit)}</strong> : <strong aria-hidden="true">→</strong>}</div></button>; })}</div> : <div className="empty"><span className="empty-icon" aria-hidden="true">⌂</span><h2>Bắt đầu từ trại đầu tiên</h2><p>Thêm tên trại, tạo một đợt nuôi rồi ghi lại các khoản thu chi.</p><button className="primary" onClick={() => edit({ type: 'farm' })}>＋ Thêm trại đầu tiên</button></div>}
        <div className="tip"><strong>Một cuốn sổ, cả nhà cùng ghi.</strong><p>Dữ liệu lưu chung trên máy chủ. Cần kết nối mạng khi mở sổ và lưu khoản mới.</p></div>
      </> : null}
      {snapshot && view === 'farm' && farm ? <>
        <button className="back" onClick={() => setView('home')}>← Các trại</button><div className="page-heading"><div><p className="eyebrow">SỔ THU CHI</p><h1>{farm.name}</h1></div>{!snapshot.batches.some(b => b.farmId === farm.id && snapshot.entries.some(e => e.batchId === b.id)) ? <button className="text-danger" onClick={() => requestDelete('Farm', farm)}>Xóa trại</button> : null}</div>
        {snapshot.batches.filter(b => b.farmId === farm.id && !b.endDate).map(active => <section key={active.id} className="section"><div className="section-title"><h2>Đợt đang nuôi</h2><span className="badge">Đang ghi chép</span></div>{batchCard(active)}{actions(active)}</section>)}
        {!snapshot.batches.some(b => b.farmId === farm.id && !b.endDate) ? <div className="empty"><h2>Trại chưa có đợt đang nuôi</h2><p>Tạo đợt để ghi tiền giống và bắt đầu theo dõi thu chi.</p><button className="primary" onClick={() => edit({ type: 'batch', farmId: farm.id })}>＋ Tạo đợt nuôi</button></div> : null}
        <section className="section"><h2>Các đợt đã kết thúc</h2><div className="stack">{snapshot.batches.filter(b => b.farmId === farm.id && b.endDate).sort((a, b) => b.endDate!.localeCompare(a.endDate!)).map(batchCard)}</div>{!snapshot.batches.some(b => b.farmId === farm.id && b.endDate) ? <p className="muted">Chưa có đợt đã kết thúc.</p> : null}</section>
      </> : null}
      {snapshot && view === 'batch' && batch ? <>
        <button className="back" onClick={() => setView('farm')}>← {farm?.name || 'Về trại'}</button><div className="page-heading"><div><p className="eyebrow">{farm?.name}</p><h1>{batch.name}</h1><p className="muted">{dateLabel(batch.startDate)}{batch.endDate ? ` – ${dateLabel(batch.endDate)}` : ' · Đang nuôi'} · {batch.pigCount} con heo giống</p></div><button className="secondary" onClick={() => edit({ type: 'batch', farmId: batch.farmId, batch })}>Sửa đợt nuôi</button></div>
        <BatchSummary batch={batch} entries={snapshot.entries} />
        {batch.endDate ? <p className="hint">Đợt đã kết thúc. Gia đình vẫn có thể bổ sung, sửa thu chi; lời/lỗ sẽ tự cập nhật.</p> : null}
        {actions(batch)}
        <section className="section"><div className="section-title"><h2>Lịch sử thu chi</h2><span className="muted">{snapshot.entries.filter(e => e.batchId === batch.id).length} khoản ghi nhận</span></div><div className="history"><article className="history-item"><div><span className="entry-kind">Heo giống</span><h3>{batch.pigCount} con heo giống</h3><p className="muted">{dateLabel(batch.startDate)}</p></div><div className="entry-right"><strong>{money(batch.pigCost)}</strong><button className="text-button" onClick={() => edit({ type: 'batch', farmId: batch.farmId, batch })}>Sửa tiền giống</button></div></article>{snapshot.entries.filter(e => e.batchId === batch.id).sort((a, b) => b.date.localeCompare(a.date)).map(entry => <article className="history-item" key={entry.id}><div><span className={`entry-kind kind-${entry.kind}`}>{kindLabel[entry.kind]}</span><h3>{entry.description || kindLabel[entry.kind]}</h3><p className="muted">{dateLabel(entry.date)}{entry.month ? ` · Tháng ${entry.month.split('-').reverse().join('/')}` : ''}</p>{entry.lines?.map((line, i) => <p key={i} className="line-detail">{line.name}: {line.bags} bao × ({money(line.price)} − {money(line.discount)})</p>)}{entry.kind === 'sale' ? <p className="line-detail">{entry.pigCount} con · {entry.kg} kg × {money(entry.price || '0')}/kg</p> : null}</div><div className="entry-right"><strong className={entry.kind === 'sale' ? 'positive' : ''}>{entry.kind === 'sale' ? '+' : '−'}{money(entry.amount)}</strong><div className="row"><button className="text-button" onClick={() => edit({ type: 'entry', kind: entry.kind, batch, entry })}>Sửa</button><button className="text-danger" aria-label={`Xóa ${kindLabel[entry.kind]} ngày ${dateLabel(entry.date)}`} onClick={() => requestDelete('Entry', entry)}>Xóa</button></div></div></article>)}</div></section>
        <div className="batch-footer">{!batch.endDate ? <button className="secondary" onClick={() => edit({ type: 'end', batch })}>Kết thúc đợt nuôi</button> : null}{!snapshot.entries.some(e => e.batchId === batch.id) ? <button className="text-danger" onClick={() => requestDelete('Batch', batch)}>Xóa đợt nuôi</button> : <p className="muted">Đợt có giao dịch được giữ lại trong sổ.</p>}</div>
      </> : null}
      {snapshot && view === 'report' ? <Report snapshot={snapshot} openBatch={openBatch} /> : null}
      <footer className="site-footer">Sổ trại nhà <span>·</span> Tiền Việt Nam (VND) <span>·</span> Giờ Việt Nam</footer>
    </main>
    {editor && snapshot ? <EditForm key={editorKey} editor={editor} snapshot={snapshot} run={run} close={() => setEditor(null)} reload={reloadEditor} /> : null}
    {deleteTarget ? <div className="dialog-backdrop"><section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Xóa {deleteTarget.type === 'Entry' ? 'khoản ghi nhận' : deleteTarget.type === 'Farm' ? 'trại này' : 'đợt nuôi này'}?</h2><p>Khoản đã xóa sẽ không còn trong sổ và kết quả thu chi sẽ được tính lại.</p>{deleteError ? <p className="error" role="alert">{deleteError}</p> : null}<div className="form-actions"><button autoFocus className="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Giữ lại</button><button className="danger" disabled={deleting} onClick={confirmDelete}>{deleting ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></section></div> : null}
  </>;
}
function BatchSummary({ batch, entries }: { batch: Batch; entries: Entry[] }) {
  const t = batchTotals(batch, entries);
  return <section className="balance-card"><p>{batch.endDate ? 'Lời / lỗ của đợt' : 'Thu − chi tạm tính'}</p><strong className={`balance ${t.profit.isNegative() ? 'balance-negative' : ''}`}>{money(t.profit)}</strong><p className="balance-note">Theo các khoản đã ghi, chưa tính heo và cám còn lại.</p><div className="balance-grid"><div><span>Tiền bán heo</span><strong>{money(t.sale)}</strong></div><div><span>Tổng chi</span><strong>{money(t.expense)}</strong></div></div><dl className="cost-breakdown"><div><dt>Tiền giống</dt><dd>{money(t.pig)}</dd></div><div><dt>Tiền cám</dt><dd>{money(t.feed)}</dd></div><div><dt>Tiền công</dt><dd>{money(t.labor)}</dd></div><div><dt>Chi phí khác</dt><dd>{money(t.other)}</dd></div></dl></section>;
}

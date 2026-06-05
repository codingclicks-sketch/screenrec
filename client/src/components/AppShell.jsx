import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlaySquare, Folder, BarChart3, Search, Plus, ChevronDown,
  User, HelpCircle, LogOut, CreditCard, Sparkles, Video, Puzzle,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useBilling } from '../hooks/useBilling';
import StorageMeter from './StorageMeter';
import s from './AppShell.module.css';

// Shared app chrome: sidebar (Library / Folders / Analytics + storage + upgrade)
// and the top header (search, Record Video dropdown, avatar menu). Used by the
// Library, Folders and Analytics pages so the navigation stays consistent.
export default function AppShell({ active = 'library', search, onSearch, headerRight, children }) {
  const { user, logout } = useAuth();
  const { usage, isPaid } = useBilling();
  const navigate = useNavigate();
  const [recordOpen, setRecordOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const recordRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (recordRef.current && !recordRef.current.contains(e.target)) setRecordOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Focus search on Cmd/Ctrl+K
  const searchRef = useRef(null);
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const NAV = [
    { id: 'library', label: 'Library', Icon: PlaySquare, to: '/' },
    { id: 'folders', label: 'Folders', Icon: Folder, to: '/folders' },
    { id: 'analytics', label: 'Analytics', Icon: BarChart3, to: '/analytics' },
  ];

  return (
    <div className={s.shell}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={s.sidebar}>
        <Link to="/" className={s.brand}><img src="/logo.png" className={s.brandImg} alt="" />VeoRec</Link>

        <nav className={s.nav}>
          {NAV.map((n) => (
            <Link key={n.id} to={n.to} className={active === n.id ? s.navActive : s.navItem}>
              <n.Icon size={18} /> {n.label}
            </Link>
          ))}
        </nav>

        <div className={s.sidebarFoot}>
          {usage && (
            <div className={s.storageBox}>
              <div className={s.storageLabel}>Storage</div>
              <StorageMeter usage={usage} isPaid={isPaid} showUpgradeHint={false} />
            </div>
          )}
          <Link to="/billing" className={s.navItem}><CreditCard size={18} /> Billing &amp; plan</Link>
          {!isPaid && (
            <div className={s.upgradeCard}>
              <div className={s.upgradeHead}><Sparkles size={16} color="#5b5bf6" /> Upgrade to Pro</div>
              <p>Unlock unlimited recordings and advanced features.</p>
              <Link to="/pricing" className={s.upgradeBtn}>Upgrade to Pro</Link>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className={s.main}>
        <header className={s.header}>
          <div className={s.searchWrap}>
            <Search size={17} className={s.searchIcon} />
            <input
              ref={searchRef}
              className={s.search}
              value={search ?? ''}
              onChange={(e) => onSearch?.(e.target.value)}
              placeholder="Search recordings…"
              disabled={!onSearch}
            />
            <span className={s.kbd}>⌘K</span>
          </div>

          <div className={s.headerRight}>
            {headerRight}
            <div className={s.recordWrap} ref={recordRef}>
              <button className={s.recordBtn} onClick={() => setHint(true)}>
                <Plus size={17} /> Record Video
              </button>
              <button className={s.recordChevron} onClick={() => setRecordOpen((o) => !o)}><ChevronDown size={16} /></button>
              {recordOpen && (
                <div className={s.dropdown} style={{ right: 0, minWidth: 220 }}>
                  <button className={s.dropItem} onClick={() => { setRecordOpen(false); setHint(true); }}><Video size={16} /> Record a screen video</button>
                  <button className={s.dropItem} onClick={() => { setRecordOpen(false); setHint(true); }}><Puzzle size={16} /> Get the extension</button>
                </div>
              )}
            </div>

            <div className={s.avatarWrap} ref={menuRef}>
              <button className={s.avatarBtn} onClick={() => setMenuOpen((o) => !o)}>
                <span className={s.avatar}>{(user?.name || '?').charAt(0).toUpperCase()}</span>
                <ChevronDown size={15} color="#9090a0" />
              </button>
              {menuOpen && (
                <div className={s.dropdown} style={{ right: 0, minWidth: 200 }}>
                  <div className={s.dropUser}><strong>{user?.name}</strong><small>{user?.email}</small></div>
                  <Link className={s.dropItem} to="/account"><User size={16} /> My account</Link>
                  <Link className={s.dropItem} to="/contact"><HelpCircle size={16} /> Help &amp; support</Link>
                  {user?.isAdmin && <Link className={s.dropItem} to="/admin"><BarChart3 size={16} /> Admin panel</Link>}
                  <div className={s.dropDivider} />
                  <button className={`${s.dropItem} ${s.dropDanger}`} onClick={logout}><LogOut size={16} /> Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={s.content}>{children}</div>
      </div>

      {/* Record hint modal */}
      {hint && (
        <div className={s.modalBg} onClick={() => setHint(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div className={s.modalIcon}><Video size={26} color="#5b5bf6" /></div>
            <h2 className={s.modalTitle}>Record a video</h2>
            <p className={s.modalText}>
              Click the <strong>VeoRec</strong> icon in your browser toolbar, choose your options, and hit record.
              Your video appears here automatically when you finish.
            </p>
            <button className={s.primaryBtn} onClick={() => setHint(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const pagePath = id => `/pages/${encodeURIComponent(id)}`;

export function pageId(pathname) {
  const match = /^\/pages\/([a-z][a-z0-9-]*)\/?$/.exec(pathname);
  return match?.[1] || null;
}

export function setupPageRoutes({ showWorkspace, isSignedIn }) {
  const forms = [...document.querySelectorAll('form[id]:not(#quick-locale)')];
  const index = new Map(forms.map(form => [form.id, form]));
  const auth = new Set(['signup', 'login', 'ldap-login']);
  const navigation = document.getElementById('app-nav');
  function refresh() {
  for (const group of navigation.querySelectorAll('.menu-links')) {
    for (const sectionLink of [...group.querySelectorAll(':scope > a')]) {
    const section = document.getElementById(sectionLink.hash.slice(1));
    if (!section) continue;
    const sectionForms = forms.filter(form => section.contains(form) && !auth.has(form.id));
    if (!sectionForms.length) continue;
    const list = document.createElement('div');
    list.className = 'page-links';
    for (const form of sectionForms) {
      const link = document.createElement('a');
      link.href = pagePath(form.id);
      link.textContent = form.querySelector('h3,h4')?.textContent ||
        form.querySelector('button[type=submit],button:not([type])')?.textContent || form.id.replaceAll('-', ' ');
      list.append(link);
    }
    sectionLink.after(list);
    }
  }
  }
  refresh();
  function render() {
    const id = pageId(location.pathname);
    document.querySelectorAll('.page-route-hidden').forEach(node => node.classList.remove('page-route-hidden'));
    document.body.classList.remove('public-form-page');
    if (!id) { document.title='Olamide'; return; }
    const form = index.get(id);
    if (!form) { history.replaceState(null, '', '/'); return; }
    if (!isSignedIn() && !auth.has(id)) { history.replaceState(null, '', pagePath('login')); return render(); }
    if (isSignedIn() && form.closest('[hidden]')) { history.replaceState(null, '', '/#dashboard'); return render(); }
    const section = form.closest('section[id]');
    if (!section) return;
    if (isSignedIn()) showWorkspace(section.id);
    else {
      document.body.classList.add('workspace-mode', 'public-form-page');
      document.getElementById('account')?.classList.remove('workspace-inactive');
    }
    for (const sibling of section.querySelectorAll('form[id]')) {
      if (sibling !== form) sibling.classList.add('page-route-hidden');
    }
    for (const group of section.querySelectorAll('details.form-group'))
      if (!group.contains(form)) group.classList.add('page-route-hidden');
    for (let parent = form.parentElement; parent && parent !== section; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS') parent.open = true;
    document.title = `${form.querySelector('h3,h4')?.textContent || id.replaceAll('-', ' ')} · Olamide`;
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="/pages/"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', link.href);
    render();
    window.scrollTo(0, 0);
  });
  window.addEventListener('popstate', render);
  render();
  return { render, refresh, go(id) { history.pushState(null, '', pagePath(id)); render(); window.scrollTo(0, 0); } };
}

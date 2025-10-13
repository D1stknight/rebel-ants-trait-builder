<script>
(async function(){
  const $ = s => document.querySelector(s);
  const keyBox = $('#admKey'); const msgKey = $('#keyMsg');

  // load/save key locally
  keyBox.value = localStorage.getItem('RA_ADMIN_KEY') || '';
  $('#saveKey').onclick = () => {
    localStorage.setItem('RA_ADMIN_KEY', keyBox.value.trim());
    msgKey.textContent = 'Saved.';
    setTimeout(()=> msgKey.textContent='', 1200);
  };

  function adminQ() {
    const k = (localStorage.getItem('RA_ADMIN_KEY')||'').trim();
    if (!k) throw new Error('Set Admin Key first');
    return '?admin=' + encodeURIComponent(k);
  }
  async function post(path, body) {
    const r = await fetch(path + adminQ(), {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify(body||{})
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async function loadStatus(){
    const r = await fetch('/api/contest/contest');
    const j = await r.json();
    $('#status').textContent = JSON.stringify(j, null, 2);
  }

  // Start
  $('#btnStart').onclick = async () => {
    try {
      const j = await post('/api/contest/start', {
        name: $('#cName').value.trim(),
        prompt: $('#cPrompt').value.trim(),
        durationDays: Math.max(1, parseInt($('#cDays').value,10) || 7)
      });
      $('#startMsg').textContent = j.ok ? `Started id=${j.id}` : ('Error: ' + j.error);
      loadStatus();
    } catch(e){ $('#startMsg').textContent = e.message; }
  };

  // Close
  $('#btnClose').onclick = async () => {
    try {
      const j = await post('/api/contest/close', {});
      $('#closeMsg').textContent = j.ok ? 'Closed.' : ('Error: ' + j.error);
      loadStatus();
    } catch(e){ $('#closeMsg').textContent = e.message; }
  };

  // Delete Entry
  $('#btnDelete').onclick = async () => {
    try {
      const id = $('#delId').value.trim();
      if (!id) { $('#delMsg').textContent='Provide an Entry ID'; return; }
      const j = await post('/api/contest/delete', { entryId: id });
      $('#delMsg').textContent = j.ok ? 'Deleted.' : ('Error: ' + j.error);
      loadStatus();
    } catch(e){ $('#delMsg').textContent = e.message; }
  };

  loadStatus();
})();
</script>


// LoveLink Prototype - localStorage only (no backend).
// Features: Registration/Login, User Catalog, Matching, Chat (local demo), Feedback, Contact.
// Data model in localStorage: users[], likes{}, messages{}, reviews[], contacts[], session{email}.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const DB = {
  load(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def }catch(e){ return def } },
  save(key, val){ localStorage.setItem(key, JSON.stringify(val)) }
};

const state = {
  currentUser: null,
  chatTargetEmail: null
};

const router = {
  go(hash){ location.hash = hash },
  start(){
    window.addEventListener('hashchange', router.render);
    state.currentUser = DB.load('session', null);
    router.render();
  },
  render(){
    // Highlight active nav
    $$('#navLinks a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === location.hash));
    // Show view
    $$('.view').forEach(v => v.classList.add('hidden'));
    const id = (location.hash || '#home').replace('#','');
    const view = $('#view-' + id) || $('#view-home');
    view.classList.remove('hidden');
    // Per-view hooks
    if(id==='catalog') renderCatalog();
    if(id==='match') computeMatches();
    if(id==='chat'){ renderChatMatches(); renderMessages(); }
    if(id==='feedback') renderReviews();
  }
};

// Toast
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(()=> t.classList.add('hidden'), 2200);
}

// Seed demo data
function seedDemo(){
  if(DB.load('users', []).length > 0){ toast('Users already exist.'); return; }
  const demo = [
    {name:'Ava Chen', email:'ava@example.com', password:'1234', age:24, gender:'female', interests:'hiking, coffee, indie films, jazz', city:'Sydney', bio:'UX student who loves coastal walks.'},
    {name:'Ben Li', email:'ben@example.com', password:'1234', age:26, gender:'male', interests:'basketball, ramen, EDM, gaming', city:'Sydney', bio:'Dev bootcamp grad, plays pickup ball.'},
    {name:'Clara Wu', email:'clara@example.com', password:'1234', age:28, gender:'female', interests:'yoga, cooking, museums, travel', city:'Melbourne', bio:'Data analyst who meal-preps a mean curry.'},
    {name:'Daniel Park', email:'daniel@example.com', password:'1234', age:29, gender:'male', interests:'photography, jazz, hiking, startup', city:'Sydney', bio:'Early-stage PM into street photos.'},
    {name:'Ethan Zhou', email:'ethan@example.com', password:'1234', age:23, gender:'male', interests:'tennis, crypto, anime, hotpot', city:'Brisbane', bio:'Comp sci student, slices a decent backhand.'},
    {name:'Fiona Zhang', email:'fiona@example.com', password:'1234', age:25, gender:'female', interests:'baking, yoga, live gigs, board games', city:'Sydney', bio:'Marketing grad baking sourdough weekly.'}
  ];
  DB.save('users', demo);
  DB.save('likes', {});
  DB.save('messages', {});
  toast('Seeded demo users.');
}

// Auth
$('#formRegister').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const user = Object.fromEntries(f.entries());
  user.age = Number(user.age);
  const users = DB.load('users', []);
  if(users.some(u => u.email === user.email)){ toast('Email already exists.'); return; }
  users.push(user);
  DB.save('users', users);
  DB.save('session', { email:user.email });
  state.currentUser = { email:user.email };
  toast('Account created.');
  router.go('#catalog');
});

$('#formLogin').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const {email, password} = Object.fromEntries(f.entries());
  const users = DB.load('users', []);
  const user = users.find(u => u.email===email && u.password===password);
  if(!user){ toast('Invalid credentials'); return; }
  DB.save('session', { email });
  state.currentUser = { email };
  $('#loginStatus').textContent = `Logged in as ${email}`;
  toast('Logged in'); router.go('#catalog');
});

function logout(){
  localStorage.removeItem('session');
  state.currentUser = null;
  $('#loginStatus').textContent = 'Logged out';
  toast('Logged out');
}

// Catalog
function clearFilters(){
  $('#fGender').value = '';
  $('#fMinAge').value = 18;
  $('#fMaxAge').value = 99;
  $('#fInterests').value = '';
  renderCatalog();
}

function userCard(u, withActions=true){
  const me = state.currentUser?.email;
  const btnLike = withActions && me && me!==u.email ? `<button onclick="likeUser('${u.email}')">Like</button>` : '';
  const btnChat = withActions && areMatched(me, u.email) ? `<button class="secondary" onclick="openChat('${u.email}')">Chat</button>` : '';
  return `<div class="card">
    <h3>${u.name} <span class="small">(${u.age}, ${u.gender})</span></h3>
    <div class="small">${u.city ?? ''}</div>
    <div class="small">Interests: ${u.interests}</div>
    <p>${u.bio ?? ''}</p>
    ${btnLike} ${btnChat}
  </div>`;
}

function renderCatalog(){
  const list = $('#catalogList'); list.innerHTML='';
  const users = DB.load('users', []);
  let filtered = users;
  const g = $('#fGender').value;
  const minA = Number($('#fMinAge').value||18);
  const maxA = Number($('#fMaxAge').value||99);
  const q = $('#fInterests').value.trim().toLowerCase();
  filtered = users.filter(u => (!g || u.gender===g) && u.age>=minA && u.age<=maxA && (!q || (u.interests||'').toLowerCase().includes(q)));
  filtered.forEach(u => list.insertAdjacentHTML('beforeend', userCard(u)));
  if(filtered.length===0) list.innerHTML = '<p class="small">No users found. Try seeding demo data.</p>';
}

// Likes & Matches
function likeUser(targetEmail){
  const me = state.currentUser?.email;
  if(!me){ toast('Please login first'); return; }
  const likes = DB.load('likes', {});
  likes[me] = likes[me] || [];
  if(!likes[me].includes(targetEmail)) likes[me].push(targetEmail);
  DB.save('likes', likes);
  toast('You liked them');
  renderCatalog();
  renderChatMatches();
}

function areMatched(a, b){
  if(!a || !b) return false;
  const likes = DB.load('likes', {});
  return (likes[a]?.includes(b)) && (likes[b]?.includes(a));
}

// Matching (simple scoring)
function computeMatches(){
  const container = $('#matchList'); container.innerHTML='';
  const meEmail = state.currentUser?.email;
  if(!meEmail){ container.innerHTML='<p class="small">Login to see matches.</p>'; return; }
  const users = DB.load('users', []);
  const me = users.find(u=>u.email===meEmail);
  const mine = (me?.interests||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  const results = users.filter(u=>u.email!==meEmail).map(u => {
    const their = (u.interests||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    const overlap = mine.filter(x => their.includes(x));
    const ageGap = Math.abs((u.age||0) - (me.age||0));
    const score = overlap.length*20 + Math.max(0, 20 - ageGap); // 0..100-ish
    return {u, score, reason:`Shared interests: ${overlap.join(', ')||'none'}; age gap ${ageGap}`};
  }).sort((a,b)=>b.score-a.score).slice(0,8);
  results.forEach(({u,score,reason}) => {
    const matched = areMatched(meEmail, u.email);
    const btn = matched ? `<button class="secondary" onclick="openChat('${u.email}')">Chat</button>`
                        : `<button onclick="likeUser('${u.email}')">Like</button>`;
    container.insertAdjacentHTML('beforeend', `<div class="card">
      <h3>${u.name} <span class="badge">Score ${score}</span></h3>
      <div class="small">${reason}</div>
      <div class="small">Interests: ${u.interests}</div>
      ${btn}
    </div>`);
  });
  if(results.length===0) container.innerHTML = '<p class="small">No candidates. Seed demo users first.</p>';
}

// Chat
function matchedUsersFor(meEmail){
  const users = DB.load('users', []);
  return users.filter(u => areMatched(meEmail, u.email));
}

function renderChatMatches(){
  const me = state.currentUser?.email;
  const el = $('#chatMatches'); el.innerHTML='';
  if(!me){ el.innerHTML='<p class="small">Login to access chat.</p>'; return; }
  const ms = matchedUsersFor(me);
  if(ms.length===0){ el.innerHTML='<p class="small">No matches yet. Like each other first.</p>'; return; }
  ms.forEach(u => el.insertAdjacentHTML('beforeend', `<div class="card">
    <b>${u.name}</b> <span class="small">(${u.email})</span><br/>
    <button onclick="openChat('${u.email}')">Open chat</button>
  </div>`));
}

function openChat(email){
  state.chatTargetEmail = email;
  $('#chatWith').textContent = 'Chat with ' + email;
  router.go('#chat');
  renderMessages();
}

function msgKey(a,b){
  return [a,b].sort().join('::');
}

function renderMessages(){
  const me = state.currentUser?.email;
  const other = state.chatTargetEmail;
  const box = $('#messages'); box.innerHTML='';
  if(!me || !other){ box.innerHTML='<p class="small">Select a match to chat.</p>'; return; }
  const all = DB.load('messages', {});
  const key = msgKey(me, other);
  (all[key]||[]).forEach(m => {
    const side = m.from===me ? 'You' : 'Them';
    box.insertAdjacentHTML('beforeend', `<div class="card"><span class="small">${side}</span><div>${m.text}</div></div>`);
  });
  box.scrollTop = box.scrollHeight;
}

function sendMessage(){
  const me = state.currentUser?.email;
  const other = state.chatTargetEmail;
  const input = $('#msgInput');
  const text = input.value.trim();
  if(!me || !other){ toast('Pick someone first'); return; }
  if(!text) return;
  const all = DB.load('messages', {});
  const key = msgKey(me, other);
  all[key] = all[key] || [];
  all[key].push({from:me, text, ts:Date.now()});
  DB.save('messages', all);
  input.value='';
  renderMessages();
  // playful bot reply
  setTimeout(()=>{
    const reply = {from:other, text: '🤖 Auto-reply: thanks for your message!', ts:Date.now()};
    const all2 = DB.load('messages', {});
    all2[key] = all2[key] || [];
    all2[key].push(reply);
    DB.save('messages', all2);
    renderMessages();
  }, 600 + Math.random()*1200);
}

// Reviews
$('#formFeedback').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const review = Object.fromEntries(f.entries());
  review.rating = Number(review.rating);
  review.ts = Date.now();
  const list = DB.load('reviews', []);
  list.unshift(review);
  DB.save('reviews', list);
  e.target.reset();
  toast('Review submitted');
  renderReviews();
});

function renderReviews(){
  const list = DB.load('reviews', []);
  const wrap = $('#reviewsList'); wrap.innerHTML='';
  if(list.length===0){ wrap.innerHTML='<p class="small">No reviews yet.</p>'; return; }
  list.slice(0,20).forEach(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5-r.rating);
    const when = new Date(r.ts).toLocaleString();
    wrap.insertAdjacentHTML('beforeend', `<div class="card">
      <div class="small">${when}</div>
      <div><b>${r.forEmail}</b> — <span class="badge">${stars}</span></div>
      <div>${r.comment}</div>
    </div>`);
  });
}

// Contact
$('#formContact').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = Object.fromEntries(f.entries());
  msg.ts = Date.now();
  const list = DB.load('contacts', []);
  list.unshift(msg); DB.save('contacts', list);
  e.target.reset();
  toast('Message received (local demo)');
  renderContacts();
});

function renderContacts(){
  const list = DB.load('contacts', []);
  const el = $('#contactList'); el.innerHTML='';
  list.slice(0,10).forEach(m => {
    el.insertAdjacentHTML('beforeend', `<div>• ${new Date(m.ts).toLocaleString()} — ${m.email} [${m.topic}]</div>`);
  });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  router.start();
  renderContacts();
});

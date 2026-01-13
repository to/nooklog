const form = document.getElementById('updateForm');
const errorDiv = document.getElementById('error');
const urlParams = new URLSearchParams(window.location.search);
const id = urlParams.get('id');

if (!id)
	showError('No ID provided');
else
	loadBookmark(id);

async function loadBookmark(id) {
	try {
		const res = await fetch(`/api/bookmarks/${id}`);
		if (!res.ok)
			throw new Error('Failed to load bookmark');
		const data = await res.json();

		document.getElementById('url').value = data.url;
		document.getElementById('title').value = data.title;
		document.getElementById('memo').value = data.memo || '';
		document.getElementById('tags').value = (data.tags || []).join(' ');
	} catch (err) {
		showError(err.message);
	}
}

form.addEventListener('submit', async e => {
	e.preventDefault();
	await saveBookmark();
});

document.addEventListener('keydown', e => {
	if (e.ctrlKey && e.key === 'Enter')
		saveBookmark();

});

async function saveBookmark() {
	errorDiv.style.display = 'none';
	const title = document.getElementById('title').value;
	const memo = document.getElementById('memo').value;

	// 数値だけのタグの中で最大のものをレートとする
	let tags = document.getElementById('tags').value.split(/\s+/).filter(t => t !== '');
	let rating = null;
	tags = tags.filter(t => {
		if (!/^\d$/.test(t))
			return true;

		rating = t > rating ? t : rating;
	});

	try {
		const res = await fetch(`/api/bookmarks/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title,
				memo,
				tags,
				rating,
			}),
		});

		if (!res.ok) {
			const errData = await res.json();
			throw new Error(errData.error || 'Update failed');
		}

		window.close();
	} catch (err) {
		showError(err.message);
	}
}

function showError(msg) {
	errorDiv.textContent = msg;
	errorDiv.style.display = 'block';
}

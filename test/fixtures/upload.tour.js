take
  .upload('text=Choose file', 'sample.txt')            // read from disk next to this script (or fetched on live pages)
  .expect('#picked', { text: 'Invoice 2026-11' })
  .upload('#drop', { name: 'notes.md', content: '# Notes', type: 'text/markdown' }, { drop: true })
  .expect('#dropped', { text: 'notes.md' });

const player = document.querySelector('.player[data-poster]');
if (player) {
  const screen = player.querySelector('[data-screen]');
  const episodes = [...player.querySelectorAll('[data-episode]')];
  let current = episodes[0];

  function choose(episode) {
    if (episode === current) return;
    current = episode;
    episodes.forEach(button => button.setAttribute('aria-pressed', String(button === current)));
    if (current.dataset.kind === 'link') {
      const link = document.createElement('a');
      link.className = 'button primary';
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.href = current.dataset.src;
      link.textContent = current.textContent + ' ↗';
      const wrapper = document.createElement('div');
      wrapper.className = 'player-link';
      wrapper.append(link);
      screen.replaceChildren(wrapper);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'video-cover';
    button.dataset.play = '';
    button.setAttribute('aria-label', '播放 ' + current.textContent);
    if (player.dataset.poster) {
      const image = new Image();
      image.src = player.dataset.poster;
      image.alt = '';
      button.append(image);
    }
    const label = document.createElement('span');
    label.textContent = '▶ 播放 ' + current.textContent;
    button.append(label);
    screen.replaceChildren(button);
  }

  player.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-episode')) choose(button);
    if (!button.hasAttribute('data-play')) return;
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.tabIndex = 0;
    video.setAttribute('aria-label', current.textContent);
    if (player.dataset.poster) video.poster = player.dataset.poster;
    video.src = current.dataset.src;
    screen.replaceChildren(video);
    video.focus();
  });
}

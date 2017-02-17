
exports.yes = {
  value: 'yes',
  regex: /\b(y)|(yes)\b/gi
};

exports.no = {
  value: 'no',
  regex: /\b(n)|(no)\b/gi
};

exports.movie = {
  value: 'movie',
  regex: /\bmovie\b/gi
};

exports.tv = {
  value: 'tv',
  regex: /\b(tv)|(show)\b/gi
};

exports.download = {
  value: 'download',
  regex: /\bd(ownload)?\b/gi
};

exports.seasonOrEpisode = {
  value: 'episode',
  regex: /\b((s(eason)? ?(\d{1,2}))|(ep?(isode)? ?(\d{1,2})))\b/gi;
};

exports.episode = {
  value: 'episode',
  regex: /\b(ep?(isode)? ?(\d{1,2}))\b/gi;
};

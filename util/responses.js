'use strict';

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
  regex: /\b((s(eason)? ?(\d{1,2}))|(ep?(isode)? ?(\d{1,2})))\b/gi
};

exports.episode = {
  value: 'episode',
  regex: /\b(ep?(isode)? ?(\d{1,2}))\b/gi
};

exports.search = {
  value: 'search',
  regex: /\bs(earch)?\b/gi
};

exports.monitor = {
  value: 'monitor',
  regex: /\bm(onitor)?\b/gi
};

exports.prev = {
  value: 'prev',
  regex: /\bp(rev)?(ious)?\b/gi
};

exports.next = {
  value: 'next',
  regex: /\bn(ext)?\b/gi
};

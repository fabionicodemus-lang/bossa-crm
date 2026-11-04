import React from 'react';
export default function Link({ href, children }) { return React.createElement('a', { href }, children); }
export function PageTopbar({ title, subtitle }) { return React.createElement('header', null,
  React.createElement('h1', null, title), React.createElement('p', null, subtitle)); }

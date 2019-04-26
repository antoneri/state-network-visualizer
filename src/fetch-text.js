export default filename =>
  fetch(filename)
    .then(res => {
      if (!res.ok) {
        throw Error(res.statusText);
      }
      return res;
    })
    .then(res => res.text())
    .catch(err => console.log(err));

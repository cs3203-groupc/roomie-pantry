const { app } = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`RoomiePantry listening on port ${PORT}`);
});

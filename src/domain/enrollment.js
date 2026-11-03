class EnrollmentError extends Error {
  constructor(message) { super(message); this.name = "EnrollmentError"; }
}

module.exports = { EnrollmentError };
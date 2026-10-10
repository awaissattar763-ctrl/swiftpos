export default function Denied() {
  return (
    <div className="card p-10 text-center max-w-md mx-auto mt-10">
      <div className="text-4xl mb-3">🔒</div>
      <h1 className="text-lg font-bold text-slate-900">Not authorized</h1>
      <p className="text-sm text-slate-500 mt-2">
        Your demo role does not have access to this screen. Log in as a Manager or Admin to view
        it.
      </p>
    </div>
  );
}

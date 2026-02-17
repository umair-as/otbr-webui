import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/topology" element={<Placeholder title="Topology" />} />
        <Route path="/diagnostics" element={<Placeholder title="Diagnostics" />} />
        <Route path="/commissioner" element={<Placeholder title="Commissioner" />} />
        <Route path="/network" element={<Placeholder title="Network" />} />
        <Route path="/dataset" element={<Placeholder title="Dataset" />} />
        <Route path="/energy" element={<Placeholder title="Energy Scan" />} />
      </Routes>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-screen">
      <h1 className="text-2xl font-medium text-gray-400">{title}</h1>
    </div>
  );
}

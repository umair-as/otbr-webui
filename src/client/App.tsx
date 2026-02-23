import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Topology from './pages/Topology';
import Diagnostics from './pages/Diagnostics';
import Commissioner from './pages/Commissioner';
import Network from './pages/Network';
import Dataset from './pages/Dataset';
import EnergyScan from './pages/EnergyScan';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="topology" element={<Topology />} />
        <Route path="diagnostics" element={<Diagnostics />} />
        <Route path="commissioner" element={<Commissioner />} />
        <Route path="network" element={<Network />} />
        <Route path="dataset" element={<Dataset />} />
        <Route path="energy" element={<EnergyScan />} />
      </Route>
    </Routes>
  );
}

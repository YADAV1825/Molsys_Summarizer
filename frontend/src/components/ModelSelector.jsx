import React from 'react';
import { FiCpu, FiChevronDown } from 'react-icons/fi';

const API = 'http://localhost:8000';

export default function ModelSelector({ model, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [models, setModels] = React.useState([]);
  const ref = React.useRef(null);

  React.useEffect(() => {
    fetch(`${API}/api/models`)
      .then((res) => res.json())
      .then((data) => setModels(data))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = models.find((m) => m.key === model) || { key: model, label: model };

  const lightningModels = models.filter((m) => m.provider === 'lightning');
  const nvidiaModels = models.filter((m) => m.provider === 'nvidia');

  return null;
}

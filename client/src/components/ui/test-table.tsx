import { useState } from "react";

interface TestTableProps {
  data: any[];
}

export function TestTable({ data }: TestTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>("");
  const [sortDesc, setSortDesc] = useState<boolean>(false);

  const handleCheckbox = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (selectedIds.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    console.log("✅ Checkbox clicked:", { id, selected: newSelected.has(id), totalSelected: newSelected.size });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(false);
    }
    console.log("✅ Sort clicked:", { field, desc: sortField === field ? !sortDesc : false });
  };

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;
    
    let aVal = sortField === 'partner' ? a.partner?.name || '' : a[sortField] || '';
    let bVal = sortField === 'partner' ? b.partner?.name || '' : b[sortField] || '';
    
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDesc ? -result : result;
  });

  return (
    <div className="space-y-4">
      <div className="text-sm">
        Test Table - {selectedIds.size} selected, sorting by {sortField} {sortDesc ? '↓' : '↑'}
      </div>
      
      <div className="border rounded">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">
                <input 
                  type="checkbox" 
                  checked={selectedIds.size === data.length && data.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(data.map(item => item.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                    console.log("✅ Select-all:", e.target.checked);
                  }}
                />
              </th>
              <th 
                className="p-2 text-left cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                System Name {sortField === 'name' && (sortDesc ? '↓' : '↑')}
              </th>
              <th 
                className="p-2 text-left cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('partner')}
              >
                Partner {sortField === 'partner' && (sortDesc ? '↓' : '↑')}
              </th>
              <th 
                className="p-2 text-left cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('landscape')}
              >
                Landscape {sortField === 'landscape' && (sortDesc ? '↓' : '↑')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.slice(0, 10).map((item) => (
              <tr key={item.id} className={selectedIds.has(item.id) ? "bg-blue-50" : "hover:bg-gray-50"}>
                <td className="p-2">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(item.id)}
                    onChange={() => handleCheckbox(item.id)}
                  />
                </td>
                <td className="p-2">{item.name}</td>
                <td className="p-2">{item.partner?.name || '—'}</td>
                <td className="p-2">{item.landscape}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {selectedIds.size > 0 && (
        <div className="p-2 bg-blue-50 rounded">
          <strong>{selectedIds.size} elementi selezionati</strong>
          <button 
            className="ml-4 px-2 py-1 bg-red-500 text-white rounded text-sm"
            onClick={() => {
              console.log("✅ Delete clicked:", Array.from(selectedIds));
              alert(`Elimineresti ${selectedIds.size} elementi`);
            }}
          >
            Delete Selected
          </button>
        </div>
      )}
    </div>
  );
}
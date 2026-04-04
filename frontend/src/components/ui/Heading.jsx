const Heading = ({ level = 1, children, className = '' }) => {
  const Tag = `h${level}`;
  return (
    <Tag className={`font-semibold text-slate-900 ${className}`}>
      {children}
    </Tag>
  );
};

export default Heading;
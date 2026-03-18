/**
 * MilSymbSizeSlider – Map button that opens a slider to control
 * the rendering size of military symbol (milsymb) icons on the map.
 *
 * Positioned as a map button (like HomeButton, ZoomIn, etc.) using
 * the `position` config parameter.
 *
 * The chosen size is broadcast via the CustomEvent "milsymb-size-change"
 * (detail = {size: Number}), which MilSymbSupport listens to in order to
 * re-style all point features.
 *
 * Range: 10 – 80 px   (default: 40)
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import './style/MilSymbSizeSlider.css';

const MIN_SIZE = 10;
const MAX_SIZE = 80;
const DEFAULT_SIZE = 40;

class MilSymbSizeSlider extends React.Component {
    static propTypes = {
        position: PropTypes.number,
        theme: PropTypes.object
    };

    static defaultProps = {
        position: 5
    };

    constructor(props) {
        super(props);
        this.state = {
            open: false,
            size: DEFAULT_SIZE
        };
        this.ref = React.createRef();
    }

    componentDidMount() {
        document.addEventListener('mousedown', this.handleClickOutside);
        document.addEventListener('touchstart', this.handleClickOutside);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickOutside);
        document.removeEventListener('touchstart', this.handleClickOutside);
    }

    handleClickOutside = (ev) => {
        if (this.state.open && this.ref.current && !this.ref.current.contains(ev.target)) {
            this.setState({open: false});
        }
    };

    hasMilSymbLayers = () => {
        const ml = this.props.theme?.milsymbLayers;
        return ml && ml.length > 0;
    };

    toggle = () => {
        this.setState((prev) => ({open: !prev.open}));
    };

    onSizeChange = (ev) => {
        const size = parseInt(ev.target.value, 10);
        this.setState({size});
        window.dispatchEvent(new CustomEvent('milsymb-size-change', {detail: {size}}));
    };

    render() {
        // Only render when the current theme has milsymb layers
        if (!this.hasMilSymbLayers()) {
            return null;
        }

        const position = this.props.position;
        const right = 8;  // px from right edge (same column as other map buttons)
        const bottom = 8 + position * 38; // stack below other map buttons

        const style = {
            position: 'absolute',
            right: right + 'px',
            bottom: bottom + 'px',
            zIndex: 1000
        };

        return (
            <div className="milsymb-size-slider-wrapper" ref={this.ref} style={style}>
                <button
                    className="milsymb-size-btn map-button"
                    onClick={this.toggle}
                    title="Symbol size"
                >
                    <span className="milsymb-btn-icon">&#x2B23;</span>
                </button>
                {this.state.open && (
                    <div className="milsymb-size-popup">
                        <label className="milsymb-size-label">
                            Symbol size: <strong>{this.state.size}px</strong>
                        </label>
                        <input
                            type="range"
                            min={MIN_SIZE}
                            max={MAX_SIZE}
                            value={this.state.size}
                            onChange={this.onSizeChange}
                            className="milsymb-size-range"
                        />
                        <div className="milsymb-size-ticks">
                            <span>{MIN_SIZE}</span>
                            <span>{MAX_SIZE}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

export default connect((state) => ({
    theme: state.theme?.current
}), {})(MilSymbSizeSlider);
